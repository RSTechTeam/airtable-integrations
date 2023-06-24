import { Syncer } from '../../../Bill.com-Airtable-Integration/src/bill_com_integration/sync.js';
import { ActiveStatus } from '../../../Bill.com-Airtable-Integration/src/common/bill_com.js';
import { getYyyyMmDd } from '../../../Bill.com-Airtable-Integration/src/common/utils.js';

// Mock the getYyyyMmDd function to always return a specific date
jest.mock('../../../Bill.com-Airtable-Integration/src/common/utils.js', () => ({
  ...jest.requireActual('../../../Bill.com-Airtable-Integration/src/common/utils.js'),
  getYyyyMmDd: jest.fn().mockReturnValue('2023-06-13'),
}));

// Mock the external services
const mockApi = {
  login: jest.fn(),
  listActive: jest.fn(),
  bulk: jest.fn(),
  create: jest.fn(),
};
const mockBase = {
  select: jest.fn(),
  update: jest.fn(),
  create: jest.fn(),
  getCurrentMso: jest.fn(),
  iterateMsos: jest.fn(),
};

// Create a new instance of the Syncer class with the mocked services
const syncer = new Syncer(mockApi, mockBase);

describe('Syncer class', () => {
  // Add a beforeEach block to reset all mocks before each test
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('syncUnpaid', () => {
    it('should sync unpaid bills or invoices', async () => {
      // Arrange
      mockBase.select.mockResolvedValueOnce([
        { get: jest.fn().mockReturnValueOnce('billComId1'), getId: jest.fn().mockReturnValueOnce('airtableId1') },
        { get: jest.fn().mockReturnValueOnce('billComId2'), getId: jest.fn().mockReturnValueOnce('airtableId2') },
      ]);
      mockApi.bulk.mockResolvedValueOnce([
        { bulk: [{ response_data: { isActive: ActiveStatus.ACTIVE, approvalStatus: '3', amount: '1000', paymentStatus: '0', updatedTime: '2023-06-13' } }] },
        { bulk: [{ response_data: { isActive: ActiveStatus.INACTIVE, approvalStatus: '1', amount: '2000', paymentStatus: '1', updatedTime: '2023-06-13' } }] },
      ]);

      // Act
      await syncer.syncUnpaid('table', 'Bill');

      // Assert
      expect(mockBase.update).toHaveBeenCalledWith('table', [
        {
          id: 'airtableId1',
          fields: {
            'Active': true,
            'Approval Status': 'Approved',
            'Effective Amount': '1000',
            'Payment Status': 'Paid In Full',
            'Paid': true,
            'Paid Date': '2023-06-13',
          },
        },
        {
          id: 'airtableId2',
          fields: {
            'Active': false,
            'Approval Status': 'Assigned',
            'Effective Amount': '2000',
            'Payment Status': 'Open',
            'Paid': false,
            'Paid Date': null,
          },
        },
      ]);
    });
  });

  describe('syncVendorCredits', () => {
    it('should sync vendor credits', async () => {
      // Arrange
      mockBase.select.mockResolvedValueOnce([
        { get: jest.fn().mockReturnValueOnce('billComId1'), getId: jest.fn().mockReturnValueOnce('airtableId1') },
        { get: jest.fn().mockReturnValueOnce('billComId2'), getId: jest.fn().mockReturnValueOnce('airtableId2') },
      ]);
      mockApi.listActive.mockResolvedValueOnce([
        { response_data: { isActive: ActiveStatus.ACTIVE, updatedTime: '2023-06-13' } },
        { response_data: { isActive: ActiveStatus.INACTIVE, updatedTime: '2023-06-13' } },
      ]);

      // Act
      await syncer.syncVendorCredits('table');

      // Assert
      expect(mockBase.update).toHaveBeenCalledWith('table', [
        {
          id: 'airtableId1',
          fields: {
            'Active': true,
            'Updated Time': '2023-06-13',
          },
        },
        {
          id: 'airtableId2',
          fields: {
            'Active': false,
            'Updated Time': '2023-06-13',
          },
        },
      ]);
    });
  });

  describe('sync', () => {
    it('should call all sync methods in order', async () => {
      // Arrange
      syncer.syncUnpaid = jest.fn().mockResolvedValue();
      syncer.syncPaid = jest.fn().mockResolvedValue();
      syncer.syncVendorCredits = jest.fn().mockResolvedValue();
      syncer.syncCustomerCredits = jest.fn().mockResolvedValue();
      syncer.syncPaymentSent = jest.fn().mockResolvedValue();
      syncer.syncPaymentReceived = jest.fn().mockResolvedValue();

      // Act
      await syncer.sync();

      // Assert
      expect(syncer.syncUnpaid).toHaveBeenCalledTimes(2);
      expect(syncer.syncPaid).toHaveBeenCalledTimes(2);
      expect(syncer.syncVendorCredits).toHaveBeenCalledTimes(1);
      expect(syncer.syncCustomerCredits).toHaveBeenCalledTimes(1);
      expect(syncer.syncPaymentSent).toHaveBeenCalledTimes(1);
      expect(syncer.syncPaymentReceived).toHaveBeenCalledTimes(1);
    });
  });
});
