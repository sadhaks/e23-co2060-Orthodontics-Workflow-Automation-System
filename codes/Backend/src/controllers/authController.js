const bcrypt = require('bcryptjs');
const { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken 
} = require('../config/auth');
const { findOne, findMany, insert, update, remove } = require('../config/database');
const { logAuditEvent } = require('../middleware/errorHandler');
const SESSION_TIMEOUT_SECONDS = Number(process.env.SESSION_TIMEOUT_SECONDS || 3600);

const issueSessionTokens = async (user) => {
  const payload = {
    userId: user.id,
    role: user.role,
    department: user.department
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  const refreshTokenHash = bcrypt.hashSync(refreshToken, 10);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await insert('refresh_tokens', {
    user_id: user.id,
    token_hash: refreshTokenHash,
    expires_at: expiresAt
  });

  return {
    accessToken,
    refreshToken
  };
};

const verifyGoogleIdToken = async (idToken) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`,
      { signal: controller.signal }
    );

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const issuer = payload.iss;
    if (issuer !== 'https://accounts.google.com' && issuer !== 'accounts.google.com') {
      return null;
    }

    if (payload.email_verified !== 'true' && payload.email_verified !== true) {
      return null;
    }

    const exp = Number(payload.exp || 0);
    const now = Math.floor(Date.now() / 1000);
    if (!exp || exp <= now) {
      return null;
    }

    const allowedClientIds = String(process.env.GOOGLE_CLIENT_ID || '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);

    if (allowedClientIds.length === 0) {
      return null;
    }

    if (!allowedClientIds.includes(payload.aud)) {
      return null;
    }

    return payload;
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

// Login controller
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user by email
    const user = await findOne('users', { email });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (user.status !== 'ACTIVE') {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    // Generate and store tokens
    const { accessToken, refreshToken } = await issueSessionTokens(user);

    // Log successful login
    await logAuditEvent(user.id, 'LOGIN', 'USER', user.id, null, {
      login_time: new Date(),
      ip_address: req.ip
    });

    // Update last login time
    await update('users', { last_login: new Date(), last_activity_at: new Date() }, { id: user.id });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          must_change_password: Boolean(user.must_change_password)
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: '24h'
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Google Sign-In controller (ID token verification)
const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    const googlePayload = await verifyGoogleIdToken(idToken);
    if (!googlePayload || !googlePayload.email) {
      return res.status(401).json({
        success: false,
        message: 'Invalid Google token'
      });
    }

    const email = String(googlePayload.email).toLowerCase();
    const user = await findOne('users', { email });

    if (!user) {
      return res.status(403).json({
        success: false,
        message: 'No OrthoFlow account found for this Google email'
      });
    }

    if (user.status !== 'ACTIVE') {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
    }

    const { accessToken, refreshToken } = await issueSessionTokens(user);

    await logAuditEvent(user.id, 'LOGIN_GOOGLE', 'USER', user.id, null, {
      login_time: new Date(),
      google_sub: googlePayload.sub || null,
      ip_address: req.ip
    });

    await update('users', { last_login: new Date(), last_activity_at: new Date() }, { id: user.id });

    return res.json({
      success: true,
      message: 'Google login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          must_change_password: Boolean(user.must_change_password)
        },
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: '24h'
        }
      }
    });
  } catch (error) {
    console.error('Google login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Refresh token controller
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required'
      });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    // Find user
    const user = await findOne('users', { id: decoded.userId, status: 'ACTIVE' });
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    const now = new Date();
    const lastActivityAt = user.last_activity_at ? new Date(user.last_activity_at) : null;
    if (lastActivityAt && Number.isFinite(lastActivityAt.getTime())) {
      const idleSeconds = Math.floor((now.getTime() - lastActivityAt.getTime()) / 1000);
      if (idleSeconds > SESSION_TIMEOUT_SECONDS) {
        await update('refresh_tokens', { is_revoked: true }, { user_id: user.id });
        return res.status(401).json({
          success: false,
          code: 'SESSION_TIMEOUT',
          message: 'Session expired due to inactivity. Please log in again.'
        });
      }
    }

    // Check if refresh token exists and is not revoked
    const storedTokens = await findMany('refresh_tokens', { 
      user_id: user.id, 
      is_revoked: false 
    });

    let validTokenFound = false;
    for (const tokenRecord of storedTokens) {
      if (bcrypt.compareSync(refreshToken, tokenRecord.token_hash)) {
        validTokenFound = true;
        
        // Check if token is expired
        if (new Date() > tokenRecord.expires_at) {
          // Remove expired token
          await remove('refresh_tokens', { id: tokenRecord.id }, false);
          return res.status(401).json({
            success: false,
            message: 'Refresh token expired'
          });
        }
        break;
      }
    }

    if (!validTokenFound) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const payload = {
      userId: user.id,
      role: user.role,
      department: user.department
    };

    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    // Store new refresh token and revoke old ones
    const refreshTokenHash = bcrypt.hashSync(newRefreshToken, 10);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Revoke all old tokens for this user
    await update('refresh_tokens', { is_revoked: true }, { user_id: user.id });

    // Insert new refresh token
    await insert('refresh_tokens', {
      user_id: user.id,
      token_hash: refreshTokenHash,
      expires_at: expiresAt
    });

    await update('users', { last_activity_at: now }, { id: user.id });

    await logAuditEvent(user.id, 'TOKEN_REFRESH', 'USER', user.id, null, {
      refresh_time: new Date()
    });

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        tokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
          expiresIn: '24h'
        }
      }
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Logout controller
const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      // Find and revoke the refresh token
      const storedTokens = await findMany('refresh_tokens', { 
        user_id: req.user.id, 
        is_revoked: false 
      });

      for (const tokenRecord of storedTokens) {
        if (bcrypt.compareSync(refreshToken, tokenRecord.token_hash)) {
          await update('refresh_tokens', { is_revoked: true }, { id: tokenRecord.id });
          break;
        }
      }
    } else {
      // Revoke all refresh tokens for this user
      await update('refresh_tokens', { is_revoked: true }, { user_id: req.user.id });
    }

    await logAuditEvent(req.user.id, 'LOGOUT', 'USER', req.user.id, null, {
      logout_time: new Date()
    });

    res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get current user profile
const getProfile = async (req, res) => {
  try {
    const user = await findOne('users', { id: req.user.id });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        status: user.status,
        must_change_password: Boolean(user.must_change_password),
        created_at: user.created_at,
        updated_at: user.updated_at
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Update profile
const updateProfile = async (req, res) => {
  try {
    const { name, department } = req.body;
    const updateData = {};

    if (name) updateData.name = name;
    if (department) updateData.department = department;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No fields to update'
      });
    }

    await update('users', updateData, { id: req.user.id });

    await logAuditEvent(req.user.id, 'PROFILE_UPDATE', 'USER', req.user.id, null, updateData);

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Get current user
    const user = await findOne('users', { id: req.user.id });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password_hash);
    
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Hash new password
    const newPasswordHash = bcrypt.hashSync(newPassword, 10);

    // Update password and clear first-login/reset requirement
    await update('users', {
      password_hash: newPasswordHash,
      must_change_password: false,
      password_changed_at: new Date()
    }, { id: req.user.id });

    // Revoke all refresh tokens (force re-login)
    await update('refresh_tokens', { is_revoked: true }, { user_id: req.user.id });

    await logAuditEvent(req.user.id, 'PASSWORD_CHANGE', 'USER', req.user.id, null, {
      password_changed_at: new Date()
    });

    res.json({
      success: true,
      message: 'Password changed successfully. Please login again.'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

module.exports = {
  login,
  googleLogin,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword
};
