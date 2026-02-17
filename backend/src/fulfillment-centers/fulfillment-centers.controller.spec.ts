import { Test, TestingModule } from '@nestjs/testing';
import { FulfillmentCentersController } from './fulfillment-centers.controller';

describe('FulfillmentCentersController', () => {
  let controller: FulfillmentCentersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FulfillmentCentersController],
    }).compile();

    controller = module.get<FulfillmentCentersController>(FulfillmentCentersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
