/**
 * @fileoverview Checks whether Bills have been paid and syncs Bill.com data
 * (e.g., Vendors, Chart of Accounts) into Airtable.
 */

import {airtableRecordUpdate, mapEntries, mapEntriesAndValues, syncChanges} from '../../common/sync.js';
import {ActiveStatus, activeFilter, filter, isActiveEnum} from '../common/api.js';
import {BILL_COM_ID_SUFFIX, MSO_BILL_COM_ID} from '../common/constants.js';
import {getYyyyMmDd} from '../../common/utils.js';
import {MsoBase} from '../../common/airtable.js';
import {PRIMARY_ORG} from '../common/constants.js';

/** Bill.com Bill Approval Statuses. */
const approvalStatuses = new Map([
  ['0', 'Unassigned'],
  ['1', 'Assigned'],
  ['4', 'Approving'],
  ['3', 'Approved'],
  ['5', 'Denied'],
]);

/** Bill.com Bill Payment Statuses. */
const paymentStatuses = new Map([
  ['1', 'Open'],
  ['4', 'Scheduled'],
  ['0', 'Paid In Full'],
  ['2', 'Partial Payment'],
]);

/**
 * @param {!Object<string, *>[]} bulkResponses
 * @param {function(!Object<string, *>, number)} func
 */
function processBulkResponses(bulkResponses, func) {
  bulkResponses.forEach(
      (responses, i) => {
        responses.bulk.forEach((r, j) => func(r.response_data, 100*i + j));
      });
}

/**
 * @param {string} name
 * @param {string} city
 * @param {string} state
 * @return {string} The vendor name, including city and/or state if present.
 */
function vendorName(name, city, state) {
  return (city == null && state == null) ? name : `${name} (${city}, ${state})`;
}

/**
 * A helper for syncing data between Airtable and Bill.com.
 * Only use while iterating airtableBase.
 */
class Syncer {

  /**
   * @param {!Api} billComApi
   * @param {!MsoBase=} airtableBase
   */
  constructor(billComApi, airtableBase = new MsoBase()) {

    /** @private @const {!Api} */
    this.billComApi_ = billComApi;
    /** @private @const {!MsoBase} */
    this.airtableBase_ = airtableBase;
  }

  /**
   * Syncs active and paid statuses of unpaid bills or invoices.
   * @param {string} table
   * @param {string} entity - Bill or Invoice.
   * @return {!Promise<undefined>}
   */
  async syncUnpaid(table, entity) {
    const airtableUnpaids = await this.airtableBase_.select(table, 'Unpaid');
    if (airtableUnpaids.length === 0) return;

    const BILL_COM_ID =
        entity === 'Bill' ? MSO_BILL_COM_ID : BILL_COM_ID_SUFFIX;
    const mapping =
        new Map(airtableUnpaids.map(r => [r.get(BILL_COM_ID), r.getId()]));
    const billComUpdates =
        await this.billComApi_.bulk('Read', entity, Array.from(mapping.keys()));
    await this.airtableBase_.update(
        table,
        billComUpdates.flat().map(
            u => {
              const isPaid = u.paymentStatus === '0';
              return {
                id: mapping.get(u.id),
                fields: {
                  'Active': u.isActive === ActiveStatus.ACTIVE,
                  'Approval Status': approvalStatuses.get(u.approvalStatus),
                  'Effective Amount': u.amount,
                  'Payment Status': paymentStatuses.get(u.paymentStatus),
                  'Paid': isPaid,
                  'Paid Date': isPaid ? getYyyyMmDd(u.updatedTime) : null,
                },
              }
            }));
  }

  /**
   * Syncs entity data to table.
   * @param {string} entity - A Bill.com entity name.
   * @param {string} table - A corresponding Airtable Table name.
   * @param {function(!Object<string, *>): !Object<string, *>} syncFunc
   *   - Determines what entity data will be synced to table.
   * @param {boolean=} useActiveFilter
   * @return {!Promise<undefined>}
   */
  async sync(entity, table, syncFunc, useActiveFilter = true) {  

    // Initialize sync changes.
    const filters = useActiveFilter ? [activeFilter] : [];
    if (entity === 'ChartOfAccount') {
      // Expenses or Income.
      filters.push(filter('accountType', 'in', '7,9'));
    }

    const billComEntities = await this.billComApi_.list(entity, filters);
    const changes = new Map();
    for (const e of billComEntities) {
      const change = syncFunc(e);
      change.Active = true;
      changes.set(e.id, change);
    }

    // Reconsider when BILL supports retrieving Vendor documents.
    // if (entity === 'Vendor') {
    //   for (const [id, change] of changes) {
    //     const urls = await this.billComApi_.getDocumentPages(id);
    //     change.Documents = urls.map(url => ({url: url}));
    //   }
    // }

    const airtableRecords = await this.airtableBase_.select(table);
    const {updates, creates, removes} =
        syncChanges(
            // Source
            changes,
            // Mapping
            new Map(
                airtableRecords.map(r => [r.get(MSO_BILL_COM_ID), r.getId()])),
            // Destination IDs
            new Set(airtableRecords.map(r => r.getId())));

    const msoRecordId = this.airtableBase_.getCurrentMso().getId();
    await this.airtableBase_.create(
        table,
        mapEntries(
            creates,
            (id, create) => ({
              fields: {MSO: [msoRecordId], [MSO_BILL_COM_ID]: id, ...create},
            })));
    await this.airtableBase_.update(
        table,
        mapEntriesAndValues(
            updates, airtableRecordUpdate,
            removes, id => ({id, fields: {Active: false}})));
  }

  /**
   * Syncs entity name to table.
   * @param {string} entity - A Bill.com entity name.
   * @param {string} table - A corresponding Airtable Table name.
   * @param {function(!Object<string, *>): string} nameFunc
   *   - Determines what entity data constitutes the name.
   * @return {!Promise<undefined>}
   */
  syncName(entity, table, nameFunc) {
    return this.sync(entity, table, o => ({Name: nameFunc(o)}));
  }

  /**
   * Syncs entity name to table.
   * @param {string} entity - A Bill.com entity name.
   * @param {string} table - A corresponding Airtable Table name.
   * @param {string} nameKey
   *   - Determines what entity data key corresponds to the name.
   * @return {!Promise<undefined>}
   */
  syncNameKey(entity, table, nameKey) {
    return this.syncName(entity, table, o => o[nameKey])
  }

  /**
   * Sync anchorEntity Customers.
   * @param {string} anchorEntity
   * @return {!Promise<undefined>}
   */
  async syncCustomers(anchorEntity) {
    const ALL_CUSTOMERS_TABLE = 'All Customers';
    const BILL_COM_ID = `${anchorEntity} ${BILL_COM_ID_SUFFIX}`;

    await this.billComApi_.login(anchorEntity);

    // Initialize Bill.com Customer collections.
    const billComCustomers = await this.billComApi_.listActive('Customer');
    const billComCustomerMap = new Map();
    billComCustomers.forEach(
        c => billComCustomerMap.set(c.id, {name: c.name, email: c.email}));

    // Upsert every Active RS Bill.com Customer from Airtable.
    const billComCreates = [];
    const airtableUpdateIds = [];
    const airtableUpdates = [];
    const billComUpdates = [];
    const customers = await this.airtableBase_.select(ALL_CUSTOMERS_TABLE);
    for (const customer of customers) {
      const isActive = customer.get('Active');
      const id = customer.get(BILL_COM_ID);
      const hasAnchorEntityId = id != undefined;
      const email = customer.get('Email');
      const name = customer.get('Name');
      const change = {
        id: id, name: name, isActive: isActiveEnum(isActive), email: email,
      };

      // Skip any record that is neither active
      // nor has an anchor entity Bill.com ID.
      if (!isActive && !hasAnchorEntityId) continue;

      // Create in Bill.com any record with no anchor entity Bill.com ID.
      if (!hasAnchorEntityId) {

        // Temporarily skip Customers with long names.
        if (name.length > 41) continue;

        billComCreates.push(change);
        airtableUpdateIds.push(customer.getId());
        continue;
      }

      // Set email address in Airtable if empty but present in Bill.com.
      if (email == undefined && billComCustomerMap.has(id)) {
        const billComEmail = billComCustomerMap.get(id).email;
        if (billComEmail != null) {
          change.email = billComEmail;
          airtableUpdates.push({
            id: customer.getId(), fields: {Email: billComEmail},
          });
        }
      }

      // Update in Bill.com other records with an anchor entity Bill.com ID.
      billComCustomerMap.delete(id);

      // Temporarily skip Customers with long names.
      if (name.length > 41) continue;

      billComUpdates.push(change);
    }

    // Bulk execute Bill.com Creates and Updates.
    if (billComCreates.length > 0) {
      const bulkResponses =
          await this.billComApi_.bulk('Create', 'Customer', billComCreates);
      processBulkResponses(
          bulkResponses,
          (r, i) => {
            airtableUpdates.push({
              id: airtableUpdateIds[i],
              fields: {[BILL_COM_ID]: r.id},
            });
          });
    }
    await this.billComApi_.bulk('Update', 'Customer', billComUpdates);
    await this.airtableBase_.update(ALL_CUSTOMERS_TABLE, airtableUpdates);

    // Create any active anchor entity Bill.com Customer not in Airtable;
    // Create in both MSO Bill.com and Airtable.
    const currentMso = this.airtableBase_.getCurrentMso();
    await this.billComApi_.login(currentMso.get('Code'));
    const msoRecordId = currentMso.getId();
    const airtableCreates = [];
    for (const [id, customer] of billComCustomerMap) {
      airtableCreates.push({
        fields: {
          Active: true,
          MSO: [msoRecordId],
          Name: customer.name,
          Email: customer.email,
          [BILL_COM_ID]: id,
          [MSO_BILL_COM_ID]:
            await this.billComApi_.create('Customer', customer),
        }
      });
    }
    await this.airtableBase_.create(ALL_CUSTOMERS_TABLE, airtableCreates);
  }
}

/**
 * @param {!Api} billComApi
 * @param {!MsoBase=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, airtableBase = new MsoBase()) {
  const syncer = new Syncer(billComApi, airtableBase);
  for await (const mso of airtableBase.iterateMsos()) {
    const msoCode = mso.get('Code');
    await billComApi.login(msoCode);
    await syncer.syncUnpaid('Check Requests', 'Bill');
    await syncer.sync(
        'Vendor', 'Existing Vendors',
        o => ({
          'Name': vendorName(o.name, o.addressCity, o.addressState),
          'Address': o.address1,
          'City': o.addressCity,
          'State': o.addressState,
          'Zip Code': parseInt(o.addressZip),
          'Paid via BILL': o.lastPaymentDate != null,
        }));
    await syncer.syncNameKey('ChartOfAccount', 'Chart of Accounts', 'name');
    await syncer.sync(
        'Profile', 'User Role Profiles', o => ({Name: o.name}), false);
    await syncer.sync(
        'User', 'Users',
        o => ({
          'Name': `${o.firstName} ${o.lastName} (${o.email})`,
          'Profile ID': o.profileId,
        }));
    await syncer.sync(
        'Customer', 'All Customers', o => ({Name: o.name, Email: o.email}));

    if (msoCode !== PRIMARY_ORG) continue;
    // sync('Department', 'Departments', o => ({Name: o.name, Email: o.email}))
    await syncer.syncUnpaid('Invoices', 'Invoice');
    await syncer.syncCustomers('CPASF');
    await syncer.syncCustomers('CEP');
  }
}
