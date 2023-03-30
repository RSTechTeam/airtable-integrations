/**
 * @fileoverview Checks whether Bills have been paid and syncs Bill.com data
 * (e.g., Vendors, Chart of Accounts) into Airtable.
 */

import {ActiveStatus, filter, isActiveEnum} from '../common/bill_com.js';
import {Base, BILL_COM_ID_SUFFIX, PRIMARY_ORG_BILL_COM_ID} from '../common/airtable.js';
import {getYyyyMmDd, PRIMARY_ORG} from '../common/utils.js';

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

/** A helper for syncing data between Airtable and Bill.com. */
class Syncer {

  /**
   * @param {!Map<string, string>} msoRecordIds
   * @param {!Api} billComApi
   * @param {!Base=} airtableBase
   */
  constructor(msoRecordIds, billComApi, airtableBase = new Base()) {

    /** @private @const {!Map<string, string>} */
    this.msoRecordIds_ = msoRecordIds;
    /** @private @const {!Api} */
    this.billComApi_ = billComApi;
    /** @private @const {!Base} */
    this.airtableBase_ = airtableBase;

    /** @private {?string} */
    this.currentMsoRecordId_ = null;
  }

  /**
   * Coordinates syncing for each MSO. All subsequent sync* methods
   * should only be called within param func.
   * @param {function(!Syncer, string): !Promise<undefined>} func
   * @return !Promise<undefined>
   */
  async forEachMso(func) {
    for (const mso of this.msoRecordIds_.keys()) {
      await this.billComApi_.login(mso);
      this.currentMsoRecordId_ = this.msoRecordIds_.get(mso);
      await func(this, mso);
    }
  }

  /**
   * Syncs active and paid statuses of unpaid bills or invoices.
   * @param {string} table
   * @param {string} entity - Bill or Invoice.
   * @return {!Promise<undefined>}
   */
  async syncUnpaid(table, entity) {
    const BILL_COM_ID =
        entity === 'Bill' ? PRIMARY_ORG_BILL_COM_ID : BILL_COM_ID_SUFFIX;

    const billComIds = [];
    const airtableIds = [];
    await this.airtableBase_.select(
        table,
        'Unpaid',
        (record) => {
          billComIds.push(record.get(BILL_COM_ID));
          airtableIds.push(record.getId());
         });
    if (billComIds.length === 0) return;

    const bulkResponses =
        await this.billComApi_.bulk('Read', entity, billComIds);
    const updates = [];
    processBulkResponses(
        bulkResponses,
        (r, i) => {
          const isPaid = r.paymentStatus === '0';
          updates.push({
            id: airtableIds[i],
            fields: {
              'Active': r.isActive === ActiveStatus.ACTIVE,
              'Approval Status': approvalStatuses.get(r.approvalStatus),
              'Effective Amount': r.amount,
              'Payment Status': paymentStatuses.get(r.paymentStatus),
              'Paid': isPaid,
              'Paid Date': isPaid ? getYyyyMmDd(r.updatedTime) : null,
            },
          });
        });
    await this.airtableBase_.update(table, updates);
  }

  /**
   * Syncs entity data to table.
   * @param {string} entity - A Bill.com entity name.
   * @param {string} table - A corresponding Airtable Table name.
   * @param {function(!Object<string, *>): !Object<string, *>} syncFunc
   *   - Determines what entity data will be synced to table.
   * @return {!Promise<undefined>}
   */
  async sync(entity, table, syncFunc) {  

    // Initialize sync changes.
    const maybeFilter = [];
    if (entity === 'ChartOfAccount') {
      // Expenses or Income.
      maybeFilter.push(filter('accountType', 'in', '7,9'));
    }
    const billComEntities =
        await this.billComApi_.listActive(entity, maybeFilter);
    const changes = new Map();
    for (const e of billComEntities) {
      const change = syncFunc(e);
      change.Active = true;
      changes.set(e.id, change);
    }

    // Update every existing table record based on the entity data.
    const updates = [];
    await this.airtableBase_.select(
        table,
        '',
        (record) => {

          // Skip records not associated with current MSO.
          if (record.get('MSO')[0] !== this.currentMsoRecordId_) return;

          const id = record.get(PRIMARY_ORG_BILL_COM_ID);
          updates.push({
            id: record.getId(), fields: changes.get(id) || {Active: false},
          });
          changes.delete(id);
        });
    await this.airtableBase_.update(table, updates);

    // Create new table records from new entity data.
    const creates = [];
    for (const [id, data] of changes) {
      creates.push({
        fields: {
          MSO: [this.currentMsoRecordId_],
          [PRIMARY_ORG_BILL_COM_ID]: id,
          ...data,
        }
      });
    }
    await this.airtableBase_.create(table, creates);
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
    await this.airtableBase_.select(
        ALL_CUSTOMERS_TABLE,
        '',
        (record) => {
          const isActive = record.get('Active');
          const id = record.get(BILL_COM_ID);
          const hasAnchorEntityId = id != undefined;
          const email = record.get('Email');
          const name = record.get('Name');
          const change = {
            id: id, name: name, isActive: isActiveEnum(isActive), email: email,
          };

          // Skip any record that is neither active
          // nor has an anchor entity Bill.com ID.
          if (!isActive && !hasAnchorEntityId) return;

          // Create in Bill.com any record with no anchor entity Bill.com ID.
          if (!hasAnchorEntityId) {

            // Temporarily skip Customers with long names.
            if (name.length > 41) return;

            billComCreates.push(change);
            airtableUpdateIds.push(record.getId());
            return;
          }

          // Set email address in Airtable if empty but present in Bill.com.
          if (email == undefined && billComCustomerMap.has(id)) {
            const billComEmail = billComCustomerMap.get(id).email;
            if (billComEmail != null) {
              change.email = billComEmail;
              airtableUpdates.push({
                id: record.getId(), fields: {Email: billComEmail},
              });
            }
          }

          // Update in Bill.com other records with an anchor entity Bill.com ID.
          billComCustomerMap.delete(id);

          // Temporarily skip Customers with long names.
          if (name.length > 41) return;

          billComUpdates.push(change);
        });

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
    // Create in both RS Bill.com and Airtable.
    await this.billComApi_.primaryOrgLogin();
    const airtableCreates = [];
    for (const [id, customer] of billComCustomerMap) {
      airtableCreates.push({
        fields: {
          Active: true,
          Name: customer.name,
          Email: customer.email,
          MSO: [this.currentMsoRecordId_],
          [BILL_COM_ID]: id,
          [PRIMARY_ORG_BILL_COM_ID]:
            await this.billComApi_.create('Customer', customer),
        }
      });
    }
    await this.airtableBase_.create(ALL_CUSTOMERS_TABLE, airtableCreates);
  }
}

/**
 * @param {!Api} billComApi
 * @param {!Base=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main(billComApi, airtableBase = new Base()) {

  const msoRecordIds = new Map();
  await airtableBase.select(
      'MSOs', '', (r) => msoRecordIds.set(r.get('Code'), r.getId()));
  await new Syncer(msoRecordIds, billComApi, airtableBase).forEachMso(
      async (syncer, mso) => {

        // sync('Department', 'Departments', o => ({Name: o.name, Email: o.email}))
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
            'User', 'Users',
            o => ({
              'Name': `${o.firstName} ${o.lastName} (${o.email})`,
              'Profile ID': o.profileId,
            }));

        if (mso !== PRIMARY_ORG) return;
        await syncer.syncUnpaid('Check Requests', 'Bill');
        await syncer.syncUnpaid('Invoices', 'Invoice');
        await syncer.sync(
            'Customer', 'All Customers', o => ({Name: o.name, Email: o.email}));
        await syncer.syncCustomers('CPASF');
        await syncer.syncCustomers('CEP');
      });
}
