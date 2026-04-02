import { financialService } from './financial.service';
import api from './api';

jest.mock('./api');

describe('financialService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('bulkCreate', () => {
    it('should call bulk API and return ok response', async () => {
      const mockResult = { importedCount: 10 };
      (api.post as jest.Mock).mockResolvedValue({ data: mockResult });

      const records = [
        { date: '2023-10-01', description: 'Test', amountEur: 1, source: 'Src' }
      ];

      const result = await financialService.bulkCreate(records);
      expect(api.post).toHaveBeenCalledWith('/financial/records/bulk', { records });
      expect(result).toEqual(mockResult);
    });
  });

  describe('getLatestExchangeRate', () => {
    it('should call exchange-rate API', async () => {
      const mockRate = { eurToVnd: 26000 };
      (api.get as jest.Mock).mockResolvedValue({ data: mockRate });

      const result = await financialService.getLatestExchangeRate();
      expect(api.get).toHaveBeenCalledWith('/financial/exchange-rate');
      expect(result).toEqual(mockRate);
    });
  });

  describe('getUniqueSources', () => {
    it('should fetch unique sources', async () => {
      const mockSources = ['Manual', 'MB Bank', 'VCB Card 1234'];
      (api.get as jest.Mock).mockResolvedValue({ data: mockSources });

      const result = await financialService.getUniqueSources();
      expect(api.get).toHaveBeenCalledWith('/financial/sources');
      expect(result).toEqual(mockSources);
    });
  });
});
