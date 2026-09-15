import { Test, TestingModule } from '@nestjs/testing';
import { RgaController } from './rga.controller';

describe('RgaController', () => {
    let controller: RgaController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [RgaController]
        }).compile();

        controller = module.get<RgaController>(RgaController);
    });

    it('should be defined', () => {
        expect(controller).toBeDefined();
    });
});
