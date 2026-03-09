const Joi = require('joi');

// Validation middleware factory
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error } = schema.validate(req[property], {
      allowUnknown: property === 'query'
    });
    
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }
    
    next();
  };
};

// Common validation schemas
const schemas = {
  // Auth schemas
  login: Joi.object({
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().min(6).required().messages({
      'string.min': 'Password must be at least 6 characters long',
      'any.required': 'Password is required'
    })
  }),

  refreshToken: Joi.object({
    refreshToken: Joi.string().required().messages({
      'any.required': 'Refresh token is required'
    })
  }),

  googleLogin: Joi.object({
    idToken: Joi.string().required().messages({
      'any.required': 'Google ID token is required'
    })
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().min(6).required().messages({
      'string.min': 'Current password must be at least 6 characters long',
      'any.required': 'Current password is required'
    }),
    newPassword: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)')).required().messages({
      'string.min': 'New password must be at least 8 characters long',
      'string.pattern.base': 'New password must contain at least one uppercase letter, one lowercase letter, and one number',
      'any.required': 'New password is required'
    })
  }),

  // User schemas
  createUser: Joi.object({
    name: Joi.string().min(2).max(255).required().messages({
      'string.min': 'Name must be at least 2 characters long',
      'string.max': 'Name cannot exceed 255 characters',
      'any.required': 'Name is required'
    }),
    email: Joi.string().email().required().messages({
      'string.email': 'Please provide a valid email address',
      'any.required': 'Email is required'
    }),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)')).optional().messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    }),
    role: Joi.string().valid('ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'NURSE', 'STUDENT', 'RECEPTION').required().messages({
      'any.only': 'Invalid role specified',
      'any.required': 'Role is required'
    }),
    department: Joi.string().max(100).optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').optional()
  }),

  updateUser: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    email: Joi.string().email().optional(),
    password: Joi.string().min(8).pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)')).optional().messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, and one number'
    }),
    role: Joi.string().valid('ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'NURSE', 'STUDENT', 'RECEPTION').optional(),
    department: Joi.string().max(100).optional(),
    status: Joi.string().valid('ACTIVE', 'INACTIVE').optional()
  }).min(1),

  // Patient schemas
  createPatient: Joi.object({
    patient_code: Joi.string().min(3).max(20).optional().messages({
      'string.min': 'Patient code must be at least 3 characters long',
      'string.max': 'Patient code cannot exceed 20 characters'
    }),
    first_name: Joi.string().min(2).max(255).required().messages({
      'string.min': 'First name must be at least 2 characters long',
      'any.required': 'First name is required'
    }),
    last_name: Joi.string().min(2).max(255).required().messages({
      'string.min': 'Last name must be at least 2 characters long',
      'any.required': 'Last name is required'
    }),
    date_of_birth: Joi.date().max('now').optional().messages({
      'date.max': 'Date of birth cannot be in the future'
    }),
    age: Joi.number().integer().min(0).max(130).optional(),
    gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').required().messages({
      'any.only': 'Gender must be MALE, FEMALE, or OTHER',
      'any.required': 'Gender is required'
    }),
    address: Joi.string().max(1000).optional(),
    province: Joi.string().max(100).optional(),
    registration_date: Joi.date().max('now').optional(),
    phone: Joi.string().max(50).optional(),
    email: Joi.string().email().optional(),
    emergency_contact_name: Joi.string().max(255).optional(),
    emergency_contact_phone: Joi.string().max(50).optional(),
    nhi_verified: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'COMPLETED', 'CONSULTATION', 'MAINTENANCE').optional()
  }).or('date_of_birth', 'age'),

  updatePatient: Joi.object({
    first_name: Joi.string().min(2).max(255).optional(),
    last_name: Joi.string().min(2).max(255).optional(),
    registration_date: Joi.date().max('now').optional(),
    date_of_birth: Joi.date().max('now').optional(),
    age: Joi.number().integer().min(0).max(130).optional(),
    gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').optional(),
    address: Joi.string().max(1000).optional(),
    province: Joi.string().max(100).optional(),
    phone: Joi.string().max(50).optional(),
    email: Joi.string().email().optional(),
    emergency_contact_name: Joi.string().max(255).optional(),
    emergency_contact_phone: Joi.string().max(50).optional(),
    nhi_verified: Joi.boolean().optional(),
    status: Joi.string().valid('ACTIVE', 'COMPLETED', 'CONSULTATION', 'MAINTENANCE').optional()
  }).min(1),

  assignPatientMember: Joi.alternatives().try(
    Joi.object({
      user_id: Joi.number().integer().positive().required().messages({
        'any.required': 'user_id is required'
      }),
      assignment_role: Joi.string().valid('ORTHODONTIST', 'DENTAL_SURGEON', 'NURSE', 'STUDENT').required().messages({
        'any.only': 'assignment_role must be ORTHODONTIST, DENTAL_SURGEON, NURSE, or STUDENT',
        'any.required': 'assignment_role is required'
      })
    }),
    Joi.object({
      assignments: Joi.array().items(
        Joi.object({
          user_id: Joi.number().integer().positive().required(),
          assignment_role: Joi.string().valid('ORTHODONTIST', 'DENTAL_SURGEON', 'NURSE', 'STUDENT').required()
        })
      ).required(),
      sync: Joi.boolean().optional()
    })
  ),

  updatePatientHistory: Joi.object({
    history: Joi.object().required().messages({
      'any.required': 'history payload is required'
    })
  }),

  // Visit schemas
  createVisit: Joi.object({
    patient_id: Joi.number().integer().positive().optional(),
    provider_id: Joi.number().integer().positive().optional(),
    visit_date: Joi.date().required().messages({
      'any.required': 'Visit date is required'
    }),
    procedure_type: Joi.string().max(255).optional(),
    status: Joi.string().valid('SCHEDULED', 'COMPLETED', 'CANCELLED', 'DID_NOT_ATTEND').optional(),
    notes: Joi.string().max(2000).optional()
  }),

  updateVisit: Joi.object({
    provider_id: Joi.number().integer().positive().optional(),
    visit_date: Joi.date().optional(),
    procedure_type: Joi.string().max(255).optional(),
    status: Joi.string().valid('SCHEDULED', 'COMPLETED', 'CANCELLED', 'DID_NOT_ATTEND').optional(),
    notes: Joi.string().max(2000).optional()
  }).min(1),

  // Clinical note schemas
  createClinicalNote: Joi.object({
    patient_id: Joi.number().integer().positive().optional(),
    content: Joi.string().min(1).max(5000).required().messages({
      'string.min': 'Note content cannot be empty',
      'string.max': 'Note content cannot exceed 5000 characters',
      'any.required': 'Note content is required'
    }),
    note_type: Joi.string().valid('TREATMENT', 'OBSERVATION', 'PROGRESS', 'SUPERVISOR_REVIEW', 'DIAGNOSIS').optional(),
    plan_procedure: Joi.string().max(255).allow('').optional(),
    planned_for: Joi.date().optional(),
    executed_at: Joi.date().optional(),
    execution_status: Joi.string().valid('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED').optional(),
    outcome_notes: Joi.string().max(5000).allow('').optional()
  }),

  updateClinicalNote: Joi.object({
    content: Joi.string().min(1).max(5000).optional(),
    note_type: Joi.string().valid('TREATMENT', 'OBSERVATION', 'PROGRESS', 'SUPERVISOR_REVIEW', 'DIAGNOSIS').optional(),
    is_verified: Joi.boolean().optional(),
    plan_procedure: Joi.string().max(255).allow('').optional(),
    planned_for: Joi.date().optional(),
    executed_at: Joi.date().optional(),
    execution_status: Joi.string().valid('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED').optional(),
    outcome_notes: Joi.string().max(5000).allow('').optional()
  }).min(1),

  createPaymentRecord: Joi.object({
    payment_date: Joi.date().required().messages({
      'any.required': 'payment_date is required'
    }),
    amount: Joi.number().positive().precision(2).required().messages({
      'number.positive': 'amount must be greater than zero',
      'any.required': 'amount is required'
    }),
    currency: Joi.string().trim().uppercase().length(3).optional().default('LKR'),
    payment_method: Joi.string().valid('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'CHEQUE', 'OTHER').required().messages({
      'any.required': 'payment_method is required'
    }),
    status: Joi.string().valid('PENDING', 'PAID', 'PARTIAL', 'REFUNDED', 'VOID').optional().default('PAID'),
    reference_number: Joi.string().max(255).allow('').optional(),
    notes: Joi.string().max(5000).allow('').optional()
  }),

  updatePaymentRecord: Joi.object({
    payment_date: Joi.date().optional(),
    amount: Joi.number().positive().precision(2).optional(),
    currency: Joi.string().trim().uppercase().length(3).optional(),
    payment_method: Joi.string().valid('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'CHEQUE', 'OTHER').optional(),
    status: Joi.string().valid('PENDING', 'PAID', 'PARTIAL', 'REFUNDED', 'VOID').optional(),
    reference_number: Joi.string().max(255).allow('').optional(),
    notes: Joi.string().max(5000).allow('').optional()
  }).min(1),

  createPatientMaterialUsage: Joi.object({
    inventory_item_id: Joi.number().integer().positive().required().messages({
      'any.required': 'inventory_item_id is required'
    }),
    quantity: Joi.number().integer().min(1).required().messages({
      'number.min': 'quantity must be at least 1',
      'any.required': 'quantity is required'
    }),
    used_at: Joi.date().optional(),
    purpose: Joi.string().max(255).allow('').optional(),
    notes: Joi.string().max(5000).allow('').optional()
  }),

  updatePatientMaterialUsage: Joi.object({
    inventory_item_id: Joi.number().integer().positive().optional(),
    quantity: Joi.number().integer().min(1).optional(),
    used_at: Joi.date().optional(),
    purpose: Joi.string().max(255).allow('').optional(),
    notes: Joi.string().max(5000).allow('').optional()
  }).min(1),

  // Queue schemas
  createQueue: Joi.object({
    patient_id: Joi.number().integer().positive().required().messages({
      'any.required': 'Patient ID is required'
    }),
    provider_id: Joi.number().integer().positive().optional(),
    student_id: Joi.number().integer().positive().optional(),
    priority: Joi.string().valid('LOW', 'NORMAL', 'HIGH', 'URGENT').optional(),
    procedure_type: Joi.string().max(255).optional(),
    notes: Joi.string().max(1000).optional()
  }),

  updateQueueStatus: Joi.object({
    status: Joi.string().valid('WAITING', 'IN_TREATMENT', 'PREPARATION', 'COMPLETED').required().messages({
      'any.required': 'Status is required'
    }),
    notes: Joi.string().max(1000).optional()
  }),

  // Case schemas
  createCase: Joi.object({
    patient_id: Joi.number().integer().positive().required().messages({
      'any.required': 'Patient ID is required'
    }),
    student_id: Joi.number().integer().positive().required().messages({
      'any.required': 'Student ID is required'
    }),
    supervisor_id: Joi.number().integer().positive().required().messages({
      'any.required': 'Supervisor ID is required'
    }),
    progress_notes: Joi.string().max(2000).optional(),
    requirements_met: Joi.object().optional()
  }),

  updateCase: Joi.object({
    status: Joi.string().valid('ASSIGNED', 'PENDING_VERIFICATION', 'VERIFIED', 'REJECTED').optional(),
    progress_notes: Joi.string().max(2000).optional(),
    requirements_met: Joi.object().optional(),
    supervisor_feedback: Joi.string().max(2000).optional()
  }).min(1),

  // Inventory schemas
  createInventoryItem: Joi.object({
    name: Joi.string().min(2).max(255).required().messages({
      'any.required': 'Item name is required'
    }),
    category: Joi.string().min(2).max(100).required().messages({
      'any.required': 'Category is required'
    }),
    quantity: Joi.number().integer().min(0).required().messages({
      'any.required': 'Quantity is required'
    }),
    unit: Joi.string().min(1).max(50).required().messages({
      'any.required': 'Unit is required'
    }),
    minimum_threshold: Joi.number().integer().min(0).required().messages({
      'any.required': 'Minimum threshold is required'
    }),
    maximum_threshold: Joi.number().integer().min(0).optional(),
    location: Joi.string().max(100).optional(),
    supplier: Joi.string().max(255).optional(),
    cost_per_unit: Joi.number().min(0).optional()
  }),

  updateInventoryItem: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    category: Joi.string().min(2).max(100).optional(),
    quantity: Joi.number().integer().min(0).optional(),
    unit: Joi.string().min(1).max(50).optional(),
    minimum_threshold: Joi.number().integer().min(0).optional(),
    maximum_threshold: Joi.number().integer().min(0).optional(),
    location: Joi.string().max(100).optional(),
    supplier: Joi.string().max(255).optional(),
    cost_per_unit: Joi.number().min(0).optional()
  }).min(1),

  // Query parameter schemas
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().max(255).optional(),
    sort: Joi.string().optional(),
    order: Joi.string().valid('ASC', 'DESC').default('DESC')
  }),

  patientFilter: Joi.object({
    status: Joi.string().valid('ACTIVE', 'COMPLETED', 'CONSULTATION', 'MAINTENANCE').optional(),
    gender: Joi.string().valid('MALE', 'FEMALE', 'OTHER').optional(),
    assigned_orthodontist: Joi.alternatives().try(
      Joi.string().valid('unassigned'),
      Joi.number().integer().positive()
    ).optional(),
    registered_from: Joi.date().iso().optional(),
    registered_to: Joi.date().iso().optional()
  })
};

module.exports = {
  validate,
  schemas
};
