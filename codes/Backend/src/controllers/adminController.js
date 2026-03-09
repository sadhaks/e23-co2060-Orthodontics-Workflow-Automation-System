// Admin Controller for User Management
const bcrypt = require('bcryptjs');
const { findOne, insert, update, remove, findAll } = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');
const { requirePermission, OBJECT_TYPES, PERMISSIONS } = require('../middleware/accessControl');

// Create new user (Admin only)
const createUser = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      department
    } = req.body;

    // Validate required fields
    if (!name || !email || !password || !role) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, email, password, role'
      });
    }

    // Validate role
    const validRoles = ['ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'NURSE', 'RECEPTION', 'STUDENT'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Valid roles: ' + validRoles.join(', ')
      });
    }

    // Check if email already exists
    const existingUser = await findOne('users', { email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user object
    const newUser = {
      name,
      email,
      password_hash: passwordHash,
      role,
      department: department || null,
      status: 'ACTIVE',
      created_at: new Date()
    };

    // Insert user
    const result = await insert('users', newUser);

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'CREATE_USER',
      resource: `User ID: ${result.insertId}`,
      details: `Created new user: ${email} with role: ${role}`
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        id: result.insertId,
        name,
        email,
        role,
        department,
        status: 'ACTIVE'
      }
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
};

// Get all users (Admin only)
const getAllUsers = async (req, res) => {
  try {
    const users = await findAll('users');
    
    // Remove password hashes from response
    const sanitizedUsers = users.map(user => {
      const { password_hash, ...userWithoutPassword } = user;
      return userWithoutPassword;
    });

    res.json({
      success: true,
      data: sanitizedUsers
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve users'
    });
  }
};

// Get user by ID (Admin only)
const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await findOne('users', { id });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove password hash from response
    const { password_hash, ...userWithoutPassword } = user;

    res.json({
      success: true,
      data: userWithoutPassword
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve user'
    });
  }
};

// Update user (Admin only)
const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, role, department, status } = req.body;

    // Check if user exists
    const existingUser = await findOne('users', { id });
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Validate role if provided
    if (role) {
      const validRoles = ['ADMIN', 'ORTHODONTIST', 'DENTAL_SURGEON', 'NURSE', 'RECEPTION', 'STUDENT'];
      if (!validRoles.includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid role'
        });
      }
    }

    // Validate status if provided
    if (status) {
      const validStatuses = ['ACTIVE', 'INACTIVE'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status'
        });
      }
    }

    // Check email uniqueness if email is being updated
    if (email && email !== existingUser.email) {
      const emailExists = await findOne('users', { email });
      if (emailExists) {
        return res.status(400).json({
          success: false,
          message: 'Email already exists'
        });
      }
    }

    // Prepare update data
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (department !== undefined) updateData.department = department;
    if (status) updateData.status = status;
    updateData.updated_at = new Date();

    // Hash new password if provided
    if (req.body.password) {
      const saltRounds = 12;
      updateData.password_hash = await bcrypt.hash(req.body.password, saltRounds);
    }

    // Update user
    await update('users', updateData, { id });

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'UPDATE_USER',
      resource: `User ID: ${id}`,
      details: `Updated user: ${email || existingUser.email}`
    });

    res.json({
      success: true,
      message: 'User updated successfully'
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
};

// Delete user (Admin only)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const existingUser = await findOne('users', { id });
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent self-deletion
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    // Soft delete user
    await remove('users', { id });

    // Log audit event
    await logAuditEvent({
      userId: req.user.id,
      action: 'DELETE_USER',
      resource: `User ID: ${id}`,
      details: `Deleted user: ${existingUser.email}`
    });

    res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
};

// Get user permissions (for frontend)
const getUserPermissions = async (req, res) => {
  try {
    const { getUserPermissions } = require('../middleware/accessControl');
    
    const userPermissions = getUserPermissions(req.user.role);

    res.json({
      success: true,
      data: {
        role: req.user.role,
        permissions: userPermissions
      }
    });

  } catch (error) {
    console.error('Get permissions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve permissions'
    });
  }
};

module.exports = {
  createUser,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  getUserPermissions
};
