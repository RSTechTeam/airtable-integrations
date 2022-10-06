/**
 * @fileoverview Checks whether Bills have been paid and syncs Bill.com data
 * (e.g., Vendors, Chart of Accounts) into Airtable.
 */

import {ActiveStatus, filter, isActiveEnum} from '../common/bill_com.js';
import {Base, BILL_COM_ID_SUFFIX, PRIMARY_ORG_BILL_COM_ID} from '../common/airtable.js';
import {getYyyyMmDd} from '../common/utils.js';

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

/** The Bill.com Integration Airtable Base. */
let billComIntegrationBase;

/** The Bill.com API connection. */
let billComApi;

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
 * Syncs active and paid statuses of unpaid bills or invoices.
 * @param {string} table
 * @param {string} entity - Bill or Invoice.
 * @return {!Promise<undefined>}
 */
async function syncUnpaid(table, entity) {
  const BILL_COM_ID =
      entity === 'Bill' ? PRIMARY_ORG_BILL_COM_ID : BILL_COM_ID_SUFFIX;

  const billComIds = [];
  const airtableIds = [];
  await billComIntegrationBase.select(
      table,
      'Unpaid',
      (record) => {
        billComIds.push(record.get(BILL_COM_ID));
        airtableIds.push(record.getId());
       });
  if (billComIds.length === 0) return;

  const bulkResponses = await billComApi.bulk('Read', entity, billComIds);
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
  await billComIntegrationBase.update(table, updates);
}

/**
 * Syncs entity data to table.
 * @param {string} entity - A Bill.com entity name.
 * @param {string} table - A corresponding Airtable Table name.
 * @param {function(!Object<string, *>): !Object<string, *>} syncFunc
 *   - Determines what entity data will be synced to table.
 * @return {!Promise<undefined>}
 */
async function sync(entity, table, syncFunc) {  

  // Initialize sync changes.
  const maybeFilter = [];
  if (entity === 'ChartOfAccount') {
    // Expenses or Income.
    maybeFilter.push(filter('accountType', 'in', '7,9'));
  }
  const billComEntities = await billComApi.listActive(entity, maybeFilter);
  const changes = new Map();
  for (const e of billComEntities) {
    const change = syncFunc(e);
    change.Active = true;
    changes.set(e.id, change);
  }

  // Update every existing table record based on the entity data.
  const updates = [];
  await billComIntegrationBase.select(
      table,
      '',
      (record) => {
        const id = record.get(PRIMARY_ORG_BILL_COM_ID);
        updates.push({
          id: record.getId(),
          fields: changes.has(id) ? changes.get(id) : {Active: false},
        });
        changes.delete(id);
      });
  await billComIntegrationBase.update(table, updates);

  // Create new table records from new entity data.
  const creates = [];
  for (const [id, data] of changes) {
    data[PRIMARY_ORG_BILL_COM_ID] = id;
    creates.push({fields: data});
  }
  await billComIntegrationBase.create(table, creates);
}

/**
 * Syncs entity name to table.
 * @param {string} entity - A Bill.com entity name.
 * @param {string} table - A corresponding Airtable Table name.
 * @param {function(!Object<string, *>): string} nameFunc
 *   - Determines what entity data constitutes the name.
 * @return {!Promise<undefined>}
 */
function syncName(entity, table, nameFunc) {
  return sync(entity, table, o => ({Name: nameFunc(o)}));
}

/**
 * Syncs entity name to table.
 * @param {string} entity - A Bill.com entity name.
 * @param {string} table - A corresponding Airtable Table name.
 * @param {string} nameKey
 *   - Determines what entity data key corresponds to the name.
 * @return {!Promise<undefined>}
 */
function syncNameKey(entity, table, nameKey) {
  return syncName(entity, table, o => o[nameKey])
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
 * Sync anchorEntity Customers.
 * @param {string} anchorEntity
 * @return {!Promise<undefined>}
 */
async function syncCustomers(anchorEntity) {
  const ALL_CUSTOMERS_TABLE = 'All Customers';
  const BILL_COM_ID = `${anchorEntity} ${BILL_COM_ID_SUFFIX}`;

  await billComApi.login(anchorEntity);

  // Initialize Bill.com Customer collections.
  const billComCustomers = await billComApi.listActive('Customer');
  const billComCustomerMap = new Map();
  billComCustomers.forEach(
      c => billComCustomerMap.set(c.id, {name: c.name, email: c.email}));

  // Upsert every Active RS Bill.com Customer from Airtable.
  const billComCreates = [];
  const airtableUpdateIds = [];
  const airtableUpdates = [];
  const billComUpdates = [];
  await billComIntegrationBase.select(
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
        await billComApi.bulk('Create', 'Customer', billComCreates);
    processBulkResponses(
        bulkResponses,
        (r, i) => {
          airtableUpdates.push({
            id: airtableUpdateIds[i],
            fields: {[BILL_COM_ID]: r.id},
          });
        });
  }
  await billComApi.bulk('Update', 'Customer', billComUpdates);
  await billComIntegrationBase.update(ALL_CUSTOMERS_TABLE, airtableUpdates);

  // Create any active anchor entity Bill.com Customer not in Airtable;
  // Create in both RS Bill.com and Airtable.
  await billComApi.primaryOrgLogin();
  const airtableCreates = [];
  for (const [id, customer] of billComCustomerMap) {
    airtableCreates.push({
      fields: {
        Active: true,
        Name: customer.name,
        Email: customer.email,
        [BILL_COM_ID]: id,
        [PRIMARY_ORG_BILL_COM_ID]:
          await billComApi.create('Customer', customer),
      }
    });
  }
  await billComIntegrationBase.create(ALL_CUSTOMERS_TABLE, airtableCreates);
}

/**
 * @param {!Api} api
 * @param {!Base=} airtableBase
 * @return {!Promise<undefined>}
 */
export async function main (api, airtableBase = new Base()) {
  billComIntegrationBase = airtableBase;
  billComApi = api;

  await billComApi.primaryOrgLogin();
  await syncUnpaid('Check Requests', 'Bill');
  await syncUnpaid('Invoices', 'Invoice');
  await sync(
      'Customer', 'All Customers', o => ({Name: o.name, Email: o.email}));
  // sync('Department', 'Departments', o => ({Name: o.name, Email: o.email}))
  await sync(
      'Vendor', 'Existing Vendors',
      o => ({
        'Name': vendorName(o.name, o.addressCity, o.addressState),
        'Address': o.address1,
        'City': o.addressCity,
        'State': o.addressState,
        'Zip Code': parseInt(o.addressZip),
      }));
  await syncNameKey('ChartOfAccount', 'Chart of Accounts', 'name');
  await sync(
      'User', 'Users',
      o => ({
        'Name': `${o.firstName} ${o.lastName} (${o.email})`,
        'Profile ID': o.profileId,
      }));

  await syncCustomers('CPASF');
  await syncCustomers('CEP');
}
