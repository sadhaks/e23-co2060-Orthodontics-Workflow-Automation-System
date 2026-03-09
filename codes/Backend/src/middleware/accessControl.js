const { query } = require('../config/database');

const PERMISSIONS = {
  CREATE: 'C',
  READ: 'R',
  UPDATE: 'U',
  DELETE: 'D',
  APPROVE: 'A'
};

const OBJECT_TYPES = {
  PATIENT_GENERAL: 'PATIENT_GENERAL',
  PATIENT_MEDICAL: 'PATIENT_MEDICAL',
  PATIENT_RADIOGRAPHS: 'PATIENT_RADIOGRAPHS',
  PATIENT_NOTES: 'PATIENT_NOTES',
  PATIENT_TREATMENT: 'PATIENT_TREATMENT',
  PATIENT_PAYMENTS: 'PATIENT_PAYMENTS',
  PATIENT_MATERIALS: 'PATIENT_MATERIALS',
  PATIENT_APPOINTMENTS: 'PATIENT_APPOINTMENTS',
  USER_ACCOUNTS: 'USER_ACCOUNTS',
  AUDIT_LOGS: 'AUDIT_LOGS'
};

// Matrix from the project specification
const ROLE_PERMISSIONS = {
  ADMIN: {
    [OBJECT_TYPES.PATIENT_GENERAL]: [PERMISSIONS.READ, PERMISSIONS.DELETE],
    [OBJECT_TYPES.PATIENT_MEDICAL]: [PERMISSIONS.READ],
    [OBJECT_TYPES.PATIENT_RADIOGRAPHS]: [PERMISSIONS.READ],
    [OBJECT_TYPES.PATIENT_NOTES]: [PERMISSIONS.READ],
    [OBJECT_TYPES.PATIENT_TREATMENT]: [PERMISSIONS.READ],
    [OBJECT_TYPES.PATIENT_PAYMENTS]: [PERMISSIONS.READ, PERMISSIONS.DELETE],
    [OBJECT_TYPES.PATIENT_MATERIALS]: [PERMISSIONS.READ, PERMISSIONS.DELETE],
    [OBJECT_TYPES.PATIENT_APPOINTMENTS]: [PERMISSIONS.READ],
    [OBJECT_TYPES.USER_ACCOUNTS]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE, PERMISSIONS.DELETE],
    [OBJECT_TYPES.AUDIT_LOGS]: [PERMISSIONS.READ]
  },
  ORTHODONTIST: {
    [OBJECT_TYPES.PATIENT_GENERAL]: [PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_MEDICAL]: [PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_RADIOGRAPHS]: [PERMISSIONS.READ, PERMISSIONS.UPDATE, PERMISSIONS.DELETE],
    [OBJECT_TYPES.PATIENT_NOTES]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE, PERMISSIONS.DELETE, PERMISSIONS.APPROVE],
    [OBJECT_TYPES.PATIENT_TREATMENT]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE, PERMISSIONS.APPROVE],
    [OBJECT_TYPES.PATIENT_PAYMENTS]: [PERMISSIONS.READ],
    [OBJECT_TYPES.PATIENT_MATERIALS]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_APPOINTMENTS]: [PERMISSIONS.READ, PERMISSIONS.UPDATE]
  },
  DENTAL_SURGEON: {
    [OBJECT_TYPES.PATIENT_GENERAL]: [PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_MEDICAL]: [PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_RADIOGRAPHS]: [PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_NOTES]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_TREATMENT]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_PAYMENTS]: [PERMISSIONS.READ],
    [OBJECT_TYPES.PATIENT_MATERIALS]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_APPOINTMENTS]: [PERMISSIONS.READ, PERMISSIONS.UPDATE]
  },
  NURSE: {
    [OBJECT_TYPES.PATIENT_GENERAL]: [PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_MEDICAL]: [],
    [OBJECT_TYPES.PATIENT_RADIOGRAPHS]: [],
    [OBJECT_TYPES.PATIENT_NOTES]: [],
    [OBJECT_TYPES.PATIENT_TREATMENT]: [],
    [OBJECT_TYPES.PATIENT_PAYMENTS]: [],
    [OBJECT_TYPES.PATIENT_MATERIALS]: [PERMISSIONS.READ, PERMISSIONS.DELETE],
    [OBJECT_TYPES.PATIENT_APPOINTMENTS]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE]
  },
  RECEPTION: {
    [OBJECT_TYPES.PATIENT_GENERAL]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_MEDICAL]: [],
    [OBJECT_TYPES.PATIENT_RADIOGRAPHS]: [],
    [OBJECT_TYPES.PATIENT_NOTES]: [PERMISSIONS.READ],
    [OBJECT_TYPES.PATIENT_TREATMENT]: [],
    [OBJECT_TYPES.PATIENT_PAYMENTS]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_MATERIALS]: [],
    [OBJECT_TYPES.PATIENT_APPOINTMENTS]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE]
  },
  STUDENT: {
    [OBJECT_TYPES.PATIENT_GENERAL]: [PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_MEDICAL]: [PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_RADIOGRAPHS]: [PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_NOTES]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_TREATMENT]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_PAYMENTS]: [],
    [OBJECT_TYPES.PATIENT_MATERIALS]: [PERMISSIONS.CREATE, PERMISSIONS.READ, PERMISSIONS.UPDATE],
    [OBJECT_TYPES.PATIENT_APPOINTMENTS]: [PERMISSIONS.READ, PERMISSIONS.UPDATE]
  }
};

const ASSIGNMENT_SCOPED_ROLES = new Set(['ORTHODONTIST', 'DENTAL_SURGEON', 'STUDENT']);

const hasPermission = (role, objectType, permission) => {
  const permissions = ROLE_PERMISSIONS[role]?.[objectType] || [];
  return permissions.includes(permission);
};

const requiresPatientAssignment = (role, objectType) => {
  if (!ASSIGNMENT_SCOPED_ROLES.has(role)) return false;

  return [
    OBJECT_TYPES.PATIENT_GENERAL,
    OBJECT_TYPES.PATIENT_MEDICAL,
    OBJECT_TYPES.PATIENT_RADIOGRAPHS,
    OBJECT_TYPES.PATIENT_NOTES,
    OBJECT_TYPES.PATIENT_TREATMENT,
    OBJECT_TYPES.PATIENT_PAYMENTS,
    OBJECT_TYPES.PATIENT_MATERIALS,
    OBJECT_TYPES.PATIENT_APPOINTMENTS
  ].includes(objectType);
};

const hasInstanceAccess = async (user, patientId, objectType, permission) => {
  if (!patientId) return true;

  if (!hasPermission(user.role, objectType, permission)) {
    return false;
  }

  if (!requiresPatientAssignment(user.role, objectType)) {
    return true;
  }

  const rows = await query(
    `SELECT 1
     FROM patient_assignments
     WHERE patient_id = ?
       AND user_id = ?
       AND assignment_role = ?
       AND active = TRUE
     LIMIT 1`,
    [patientId, user.id, user.role]
  );

  return rows.length > 0;
};

const resolvePatientIdFromRequest = async (req, options = {}) => {
  if (options.patientIdParam && req.params[options.patientIdParam]) {
    return req.params[options.patientIdParam];
  }

  if (req.params.patientId) {
    return req.params.patientId;
  }

  if (typeof options.resolvePatientId === 'function') {
    return await options.resolvePatientId(req);
  }

  return null;
};

const requirePermission = (objectType, permission, options = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (!hasPermission(req.user.role, objectType, permission)) {
        return res.status(403).json({
          success: false,
          message: `Access denied: ${req.user.role} lacks ${permission} on ${objectType}`
        });
      }

      const patientId = await resolvePatientIdFromRequest(req, options);
      if (!patientId) {
        return next();
      }

      const allowed = await hasInstanceAccess(req.user, patientId, objectType, permission);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          message: 'Access denied for this patient record'
        });
      }

      req.patientScope = { patientId: Number(patientId) };
      next();
    } catch (error) {
      console.error('Access control error:', error);
      return res.status(500).json({
        success: false,
        message: 'Access control error'
      });
    }
  };
};

const getUserPermissions = (role) => ROLE_PERMISSIONS[role] || {};

module.exports = {
  PERMISSIONS,
  OBJECT_TYPES,
  ROLE_PERMISSIONS,
  hasPermission,
  hasInstanceAccess,
  requirePermission,
  getUserPermissions
};
