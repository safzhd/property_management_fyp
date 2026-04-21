const { pool } = require('../config/database');
const { generateUUID } = require('../utils/uuid');

class PropertyService {
  async create(landlordId, data) {
    const id = generateUUID();

    await pool.query(
      `INSERT INTO properties (
        id, landlord_id, property_name, property_type,
        door_number, address_line_1, address_line_2, city, county, postcode, country,
        is_hmo, hmo_licence_required, hmo_licence_number, hmo_licence_expiry, hmo_max_occupants,
        prs_registered, prs_registration_number, prs_registration_date,
        total_rooms, total_bathrooms, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        landlordId,
        data.propertyName || null,
        data.propertyType,
        data.doorNumber || null,
        data.addressLine1,
        data.addressLine2 || null,
        data.city,
        data.county || null,
        data.postcode,
        data.country || 'United Kingdom',
        data.isHmo || false,
        data.hmoLicenceRequired || false,
        data.hmoLicenceNumber || null,
        data.hmoLicenceExpiry || null,
        data.hmoMaxOccupants || null,
        data.prsRegistered || false,
        data.prsRegistrationNumber || null,
        data.prsRegistrationDate || null,
        data.totalRooms || 0,
        data.totalBathrooms || 0,
        data.status || 'active'
      ]
    );

    return this.getById(id);
  }

  async getById(id) {
    const [properties] = await pool.query(
      `SELECT p.*,
              u.email as landlord_email, u.given_name as landlord_given_name, u.last_name as landlord_last_name,
              (SELECT COUNT(*) FROM rooms r WHERE r.property_id = p.id) as rooms_count,
              (SELECT COUNT(*) FROM documents d WHERE d.property_id = p.id AND d.document_type = 'photo' AND d.room_id IS NULL) as photo_count
       FROM properties p
       JOIN users u ON p.landlord_id = u.id
       WHERE p.id = ?`,
      [id]
    );

    if (properties.length === 0) {
      return null;
    }

    return this.formatProperty(properties[0]);
  }

  async getByLandlord(landlordId, options = {}) {
    const { status, isHmo, limit = 50, offset = 0 } = options;

    let query = `
      SELECT p.*,
             u.email as landlord_email, u.given_name as landlord_given_name, u.last_name as landlord_last_name,
             (SELECT COUNT(*) FROM rooms r WHERE r.property_id = p.id) as rooms_count,
             (SELECT COUNT(*) FROM documents d WHERE d.property_id = p.id AND d.document_type = 'photo' AND d.room_id IS NULL) as photo_count
      FROM properties p
      JOIN users u ON p.landlord_id = u.id
      WHERE p.landlord_id = ?
    `;
    const params = [landlordId];

    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }

    if (isHmo !== undefined) {
      query += ' AND p.is_hmo = ?';
      params.push(isHmo);
    }

    query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const [properties] = await pool.query(query, params);
    return properties.map(p => this.formatProperty(p));
  }

  async update(id, data) {
    const updates = [];
    const values = [];

    const fieldMap = {
      propertyName: 'property_name',
      propertyType: 'property_type',
      doorNumber: 'door_number',
      addressLine1: 'address_line_1',
      addressLine2: 'address_line_2',
      city: 'city',
      county: 'county',
      postcode: 'postcode',
      country: 'country',
      isHmo: 'is_hmo',
      hmoLicenceRequired: 'hmo_licence_required',
      hmoLicenceNumber: 'hmo_licence_number',
      hmoLicenceExpiry: 'hmo_licence_expiry',
      hmoMaxOccupants: 'hmo_max_occupants',
      prsRegistered: 'prs_registered',
      prsRegistrationNumber: 'prs_registration_number',
      prsRegistrationDate: 'prs_registration_date',
      totalRooms: 'total_rooms',
      totalBathrooms: 'total_bathrooms',
      status: 'status'
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (data[key] !== undefined) {
        updates.push(`${column} = ?`);
        // Convert empty strings to null so MySQL date/varchar columns don't reject them
        values.push(data[key] === '' ? null : data[key]);
      }
    }

    if (updates.length === 0) {
      return this.getById(id);
    }

    values.push(id);
    await pool.query(
      `UPDATE properties SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    return this.getById(id);
  }

  async delete(id) {
    // Soft delete - set status to archived
    await pool.query(
      'UPDATE properties SET status = ? WHERE id = ?',
      ['archived', id]
    );
    return true;
  }

  async getStats(landlordId) {
    const [stats] = await pool.query(
      `SELECT
        COUNT(*) as total_properties,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_properties,
        SUM(CASE WHEN is_hmo = TRUE THEN 1 ELSE 0 END) as hmo_properties,
        SUM(total_rooms) as total_rooms
       FROM properties
       WHERE landlord_id = ?`,
      [landlordId]
    );

    return stats[0];
  }

  formatProperty(p) {
    return {
      id: p.id,
      landlordId: p.landlord_id,
      landlord: p.landlord_email ? {
        email: p.landlord_email,
        name: `${p.landlord_given_name} ${p.landlord_last_name}`
      } : undefined,
      propertyName: p.property_name,
      propertyType: p.property_type,
      doorNumber: p.door_number,
      addressLine1: p.address_line_1,
      addressLine2: p.address_line_2,
      city: p.city,
      county: p.county,
      postcode: p.postcode,
      country: p.country,
      isHmo: Boolean(p.is_hmo),
      hmoLicenceRequired: Boolean(p.hmo_licence_required),
      hmoLicenceNumber: p.hmo_licence_number,
      hmoLicenceExpiry: p.hmo_licence_expiry,
      hmoMaxOccupants: p.hmo_max_occupants,
      prsRegistered: Boolean(p.prs_registered),
      prsRegistrationNumber: p.prs_registration_number,
      prsRegistrationDate: p.prs_registration_date,
      totalRooms: p.total_rooms,
      totalBathrooms: p.total_bathrooms,
      roomCount: Number(p.rooms_count ?? 0),
      photoCount: Number(p.photo_count ?? 0),
      status: p.status,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    };
  }
}

module.exports = new PropertyService();
