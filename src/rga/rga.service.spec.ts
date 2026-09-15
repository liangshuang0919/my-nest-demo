import { Test, TestingModule } from '@nestjs/testing';
import { RgaService } from './rga.service';

describe('RgaService', () => {
    let service: RgaService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [RgaService]
        }).compile();

        service = module.get<RgaService>(RgaService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });
});
