'use strict';

// Verifies server/controllers/equipment.controller.js's new photo support
// from the S7 Phase 3 Admin Portal redesign — a real per-listing photo
// (uploaded to Supabase Storage, same private-bucket-plus-proxy pattern as
// borrower documents) replacing the category-level stock icon that used to
// be the Equipment Showroom's only visual. Scoped to what this pass added
// (serialize()'s photoUrl, uploadPhoto, downloadPhoto) — this controller
// had zero prior test coverage, not fully closed here.

const mockStorageFrom = { upload: jest.fn(), download: jest.fn() };
jest.mock('../../models', () => ({
  Equipment: { findByPk: jest.fn() },
  Category: {},
  Item: {}
}));
jest.mock('../../config/supabase', () => ({
  getClient: () => ({ storage: { from: () => mockStorageFrom } })
}));

const { Equipment } = require('../../models');
const ctrl = require('../../controllers/equipment.controller');

function mockRes() {
  return { json: jest.fn(), set: jest.fn(), send: jest.fn(), status: jest.fn().mockReturnThis() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('serialize() photoUrl (via getOne)', () => {
  test('points at the proxy route when a photo has been uploaded', async () => {
    Equipment.findByPk.mockResolvedValueOnce({ id: 7, equipmentName: 'Basketball', photoPath: 'equipment-7-123.jpg', category: null });
    const res = mockRes();
    await ctrl.getOne({ params: { id: '7' } }, res);
    expect(res.json.mock.calls[0][0].data.photoUrl).toBe('/api/equipment/7/photo');
  });

  test('is null when no photo has ever been uploaded', async () => {
    Equipment.findByPk.mockResolvedValueOnce({ id: 8, equipmentName: 'Volleyball', photoPath: null, category: null });
    const res = mockRes();
    await ctrl.getOne({ params: { id: '8' } }, res);
    expect(res.json.mock.calls[0][0].data.photoUrl).toBeNull();
  });
});

describe('POST /api/equipment/:id/photo (uploadPhoto)', () => {
  test('uploads to storage and saves the returned key on the Equipment row', async () => {
    const equipment = { id: 7, photoPath: null, save: jest.fn().mockResolvedValue() };
    Equipment.findByPk.mockResolvedValueOnce(equipment).mockResolvedValueOnce({ id: 7, photoPath: 'equipment-7-999.jpg', category: null });
    mockStorageFrom.upload.mockResolvedValueOnce({ error: null });

    const req = { params: { id: '7' }, file: { originalname: 'ball.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('x') } };
    const res = mockRes();
    await ctrl.uploadPhoto(req, res);

    expect(mockStorageFrom.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^equipment-7-\d+\.jpg$/),
      req.file.buffer,
      { contentType: 'image/jpeg', upsert: false }
    );
    expect(equipment.photoPath).toMatch(/^equipment-7-\d+\.jpg$/);
    expect(equipment.save).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].data.photoUrl).toBe('/api/equipment/7/photo');
  });

  test('404s when the equipment does not exist', async () => {
    Equipment.findByPk.mockResolvedValueOnce(null);
    await expect(
      ctrl.uploadPhoto({ params: { id: '999' }, file: { originalname: 'x.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('x') } }, mockRes())
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('surfaces a 502 when Supabase Storage returns an error, without saving photoPath', async () => {
    const equipment = { id: 7, photoPath: null, save: jest.fn() };
    Equipment.findByPk.mockResolvedValueOnce(equipment);
    mockStorageFrom.upload.mockResolvedValueOnce({ error: { message: 'bucket not found' } });

    await expect(
      ctrl.uploadPhoto({ params: { id: '7' }, file: { originalname: 'x.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('x') } }, mockRes())
    ).rejects.toMatchObject({ statusCode: 502 });
    expect(equipment.save).not.toHaveBeenCalled();
  });
});

describe('GET /api/equipment/:id/photo (downloadPhoto)', () => {
  test('streams the stored photo with its content type', async () => {
    Equipment.findByPk.mockResolvedValueOnce({ id: 7, photoPath: 'equipment-7-123.jpg' });
    mockStorageFrom.download.mockResolvedValueOnce({
      data: { type: 'image/jpeg', arrayBuffer: async () => Buffer.from('fake-bytes') },
      error: null
    });

    const res = mockRes();
    await ctrl.downloadPhoto({ params: { id: '7' } }, res);

    expect(res.set).toHaveBeenCalledWith('Content-Type', 'image/jpeg');
    expect(res.send).toHaveBeenCalledTimes(1);
  });

  test('404s when the equipment has no photo on file', async () => {
    Equipment.findByPk.mockResolvedValueOnce({ id: 8, photoPath: null });
    await expect(ctrl.downloadPhoto({ params: { id: '8' } }, mockRes())).rejects.toMatchObject({ statusCode: 404 });
  });

  test('404s when the equipment does not exist at all', async () => {
    Equipment.findByPk.mockResolvedValueOnce(null);
    await expect(ctrl.downloadPhoto({ params: { id: '999' } }, mockRes())).rejects.toMatchObject({ statusCode: 404 });
  });
});
