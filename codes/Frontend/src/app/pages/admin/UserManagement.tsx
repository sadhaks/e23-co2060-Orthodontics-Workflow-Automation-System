import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Chip,
  Alert,
  Snackbar,
  CircularProgress,
  LinearProgress,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckCircleIcon,
  DeleteForever as DeleteForeverIcon,
  VpnKey as VpnKeyIcon
} from '@mui/icons-material';
import { apiService } from '../../services/api';
import { CreateUserForm } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Navigate } from 'react-router';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const UserManagement: React.FC = () => {
  const { user } = useAuth();
  
  // Redirect non-admin users
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'success' as 'success' | 'error' });
  const [creatingUser, setCreatingUser] = useState(false);
  const [createProgressStep, setCreateProgressStep] = useState(0);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmText: string;
    severity: 'info' | 'warning' | 'error';
    requireAcknowledge: boolean;
    acknowledgeText: string;
    acknowledged: boolean;
    onConfirm: null | (() => Promise<void> | void);
    processing: boolean;
  }>({
    open: false,
    title: '',
    message: '',
    confirmText: 'Confirm',
    severity: 'info',
    requireAcknowledge: false,
    acknowledgeText: '',
    acknowledged: false,
    onConfirm: null,
    processing: false
  });

  const [formData, setFormData] = useState<CreateUserForm>({
    name: '',
    email: '',
    role: '',
    department: 'Orthodontics' // Fixed to Orthodontics department
  });

  const roles = [
    { value: 'ADMIN', label: 'Administrator' },
    { value: 'ORTHODONTIST', label: 'Orthodontist' },
    { value: 'DENTAL_SURGEON', label: 'Dental Surgeon' },
    { value: 'NURSE', label: 'Nurse' },
    { value: 'RECEPTION', label: 'Receptionist' },
    { value: 'STUDENT', label: 'Student' }
  ];

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (!creatingUser) {
      setCreateProgressStep(0);
      return;
    }

    const timer = window.setInterval(() => {
      setCreateProgressStep((prev) => (prev + 1) % 4);
    }, 700);

    return () => window.clearInterval(timer);
  }, [creatingUser]);

  const loadUsers = async (filters?: { search?: string; role?: string }) => {
    try {
      setLoading(true);
      setError(null);

      const activeSearch = (filters?.search ?? searchTerm).trim();
      const activeRole = (filters?.role ?? roleFilter).trim();
      const pageSize = 100;
      let page = 1;
      let totalPages = 1;
      const allUsers: User[] = [];

      do {
        const response = await apiService.users.getAll({
          page,
          limit: pageSize,
          search: activeSearch || undefined,
          role: activeRole || undefined
        });

        if (!response.success || !response.data) {
          setError('Failed to load users');
          break;
        }

        const pageUsers = response.data.users || response.data || [];
        allUsers.push(...pageUsers);

        const pagination = response.data.pagination;
        if (!pagination) {
          break;
        }

        totalPages = pagination.total_pages || 1;
        page += 1;
      } while (page <= totalPages);

      const dedupedUsers = Array.from(
        new Map(allUsers.map((u: User) => [u.id, u])).values()
      );

      setUsers(dedupedUsers);
    } catch (err: any) {
      setError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    loadUsers();
  };

  const resetFilters = () => {
    setSearchTerm('');
    setRoleFilter('');
    loadUsers({ search: '', role: '' });
  };

  const handleCreateUser = async () => {
    if (creatingUser) return;

    try {
      setCreatingUser(true);
      const response = await apiService.users.create(formData);
      
      if (response.success) {
        setSnackbar({ open: true, message: response.message || 'User successfully created', severity: 'success' });
        setCreateDialogOpen(false);
        setFormData({ name: '', email: '', role: '', department: 'Orthodontics' });
        loadUsers();
      } else {
        setSnackbar({ open: true, message: response.message || 'Failed to create user', severity: 'error' });
      }
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to create user', severity: 'error' });
    } finally {
      setCreatingUser(false);
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      const updateData: { name: string; email: string; role: string; department: string } = {
        name: formData.name,
        email: formData.email,
        role: formData.role,
        department: formData.department
      };

      const response = await apiService.users.update(selectedUser.id, updateData);
      if (response.success) {
        setSnackbar({ open: true, message: 'User updated successfully', severity: 'success' });
        setEditDialogOpen(false);
        setSelectedUser(null);
        setFormData({ name: '', email: '', role: '', department: 'Orthodontics' });
        loadUsers();
      } else {
        setSnackbar({ open: true, message: response.message || 'Failed to update user', severity: 'error' });
      }
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to update user', severity: 'error' });
    }
  };

  const openConfirmDialog = (config: {
    title: string;
    message: string;
    confirmText: string;
    severity?: 'info' | 'warning' | 'error';
    requireAcknowledge?: boolean;
    acknowledgeText?: string;
    onConfirm: () => Promise<void> | void;
  }) => {
    setConfirmDialog({
      open: true,
      title: config.title,
      message: config.message,
      confirmText: config.confirmText,
      severity: config.severity || 'info',
      requireAcknowledge: Boolean(config.requireAcknowledge),
      acknowledgeText: config.acknowledgeText || '',
      acknowledged: !config.requireAcknowledge,
      onConfirm: config.onConfirm,
      processing: false
    });
  };

  const closeConfirmDialog = () => {
    if (confirmDialog.processing) return;
    setConfirmDialog((prev) => ({
      ...prev,
      open: false,
      onConfirm: null,
      acknowledged: false
    }));
  };

  const runConfirmDialog = async () => {
    if (!confirmDialog.onConfirm || confirmDialog.processing) return;
    setConfirmDialog((prev) => ({ ...prev, processing: true }));
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog((prev) => ({ ...prev, open: false, onConfirm: null, acknowledged: false, processing: false }));
    } catch {
      setConfirmDialog((prev) => ({ ...prev, processing: false }));
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    openConfirmDialog({
      title: 'Delete User',
      message: `You are about to deactivate ${email}. This user will lose access but can be reactivated later.`,
      confirmText: 'Delete User',
      severity: 'warning',
      requireAcknowledge: true,
      acknowledgeText: 'I understand this will deactivate the user account.',
      onConfirm: async () => {
        try {
          const response = await apiService.users.delete(userId);
          if (response.success) {
            setSnackbar({ open: true, message: 'User deleted successfully', severity: 'success' });
            loadUsers();
          } else {
            setSnackbar({ open: true, message: response.message || 'Failed to delete user', severity: 'error' });
          }
        } catch (err: any) {
          setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to delete user', severity: 'error' });
        }
      }
    });
  };

  const handleActivateUser = async (targetUser: User) => {
    openConfirmDialog({
      title: 'Reactivate User',
      message: `Reactivate ${targetUser.email} and restore account access?`,
      confirmText: 'Reactivate',
      severity: 'info',
      onConfirm: async () => {
        try {
          const response = await apiService.users.update(targetUser.id, { status: 'ACTIVE' });
          if (response.success) {
            setSnackbar({ open: true, message: 'User activated successfully', severity: 'success' });
            loadUsers();
          } else {
            setSnackbar({ open: true, message: response.message || 'Failed to activate user', severity: 'error' });
          }
        } catch (err: any) {
          setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to activate user', severity: 'error' });
        }
      }
    });
  };

  const handleResetPassword = async (targetUser: User) => {
    openConfirmDialog({
      title: 'Reset Password',
      message: `Generate a secure temporary password and email it to ${targetUser.email}?`,
      confirmText: 'Send Reset Email',
      severity: 'info',
      onConfirm: async () => {
        try {
          const response = await apiService.users.resetPassword(targetUser.id);
          if (response.success) {
            const successMessage = response.message || 'Password reset successful. Temporary password sent to user email.';
            setSnackbar({
              open: true,
              message: successMessage,
              severity: 'success'
            });
          } else {
            setSnackbar({ open: true, message: response.message || 'Failed to reset password', severity: 'error' });
          }
        } catch (err: any) {
          setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to reset password', severity: 'error' });
        }
      }
    });
  };

  const handlePermanentDeleteUser = async (targetUser: User) => {
    if (targetUser.status !== 'INACTIVE') {
      setSnackbar({ open: true, message: 'Deactivate the user first before permanent delete', severity: 'error' });
      return;
    }

    openConfirmDialog({
      title: 'Permanently Delete User',
      message: `This will permanently remove ${targetUser.email} and cannot be undone.`,
      confirmText: 'Delete Permanently',
      severity: 'error',
      requireAcknowledge: true,
      acknowledgeText: 'I understand this permanent deletion cannot be undone.',
      onConfirm: async () => {
        try {
          const response = await apiService.users.delete(targetUser.id, true);
          if (response.success) {
            setSnackbar({ open: true, message: 'User permanently deleted', severity: 'success' });
            loadUsers();
          } else {
            setSnackbar({ open: true, message: response.message || 'Failed to permanently delete user', severity: 'error' });
          }
        } catch (err: any) {
          setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to permanently delete user', severity: 'error' });
        }
      }
    });
  };

  const openEditDialog = (user: User) => {
    setSelectedUser(user);
    setFormData({
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department || ''
    });
    setEditDialogOpen(true);
  };

  const getRoleColor = (role: string) => {
    const colors: { [key: string]: string } = {
      'ADMIN': '#f44336',
      'ORTHODONTIST': '#2196f3',
      'DENTAL_SURGEON': '#4caf50',
      'NURSE': '#ff9800',
      'RECEPTION': '#9c27b0',
      'STUDENT': '#607d8b'
    };
    return colors[role] || '#757575';
  };

  const getStatusColor = (status: string) => {
    return status === 'ACTIVE' ? '#4caf50' : '#f44336';
  };

  const formatDateDDMMYYYY = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const actionTileSx = {
    borderRadius: '12px',
    textTransform: 'none',
    fontWeight: 700,
    minWidth: '120px',
    height: '36px',
    px: 1.75,
    fontSize: '0.78rem',
    letterSpacing: '0.01em',
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.12)',
    transition: 'all 0.2s ease',
    '&:hover': {
      boxShadow: '0 8px 18px rgba(15, 23, 42, 0.18)',
      transform: 'translateY(-1px)'
    },
    '&:active': {
      transform: 'translateY(0)'
    }
  };

  const snackbarNode = (
    <Snackbar
      open={snackbar.open}
      autoHideDuration={6000}
      onClose={() => setSnackbar({ ...snackbar, open: false })}
    >
      <Alert severity={snackbar.severity} onClose={() => setSnackbar({ ...snackbar, open: false })}>
        {snackbar.message}
      </Alert>
    </Snackbar>
  );

  if (loading) {
    return (
      <>
        <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
          <Typography>Loading users...</Typography>
        </Box>
        {snackbarNode}
      </>
    );
  }

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === 'ACTIVE').length;
  const inactiveUsers = users.filter((u) => u.status === 'INACTIVE').length;

  return (
    <Box p={{ xs: 2, md: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em' }}>
        User Management
      </Typography>
      <Typography variant="body1" sx={{ color: '#64748b', mb: 2.25 }}>
        Manage hospital users, roles, and account lifecycle.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2.5}>
        <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
          <Typography variant="body2" sx={{ color: '#334155', fontWeight: 600, px: 1.5, py: 0.6, borderRadius: '999px', backgroundColor: '#f1f5f9', border: '1px solid #e2e8f0' }}>
            Total Users: {totalUsers}
          </Typography>
          <Typography variant="body2" sx={{ color: '#166534', fontWeight: 700, px: 1.5, py: 0.6, borderRadius: '999px', backgroundColor: '#dcfce7', border: '1px solid #bbf7d0' }}>
            Active Users: {activeUsers}
          </Typography>
          <Typography variant="body2" sx={{ color: '#991b1b', fontWeight: 700, px: 1.5, py: 0.6, borderRadius: '999px', backgroundColor: '#fee2e2', border: '1px solid #fecaca' }}>
            Inactive Users: {inactiveUsers}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
          sx={{
            borderRadius: '10px',
            textTransform: 'none',
            fontWeight: 700,
            px: 2.2,
            py: 1,
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            boxShadow: '0 8px 18px rgba(37, 99, 235, 0.25)',
            '&:hover': {
              background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
              boxShadow: '0 10px 22px rgba(29, 78, 216, 0.32)'
            }
          }}
        >
          Add User
        </Button>
      </Box>

      <Box
        display="flex"
        gap={2}
        alignItems="center"
        flexWrap="wrap"
        mb={2.5}
        sx={{
          p: 1.5,
          borderRadius: '14px',
          backgroundColor: '#f8fafc',
          border: '1px solid #e2e8f0'
        }}
      >
        <TextField
          label="Search user"
          placeholder="Name or username/email"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              applyFilters();
            }
          }}
          size="small"
          sx={{ minWidth: 280 }}
        />
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>Filter by role</InputLabel>
          <Select
            value={roleFilter}
            label="Filter by role"
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <MenuItem value="">All roles</MenuItem>
            {roles.map((role) => (
              <MenuItem key={role.value} value={role.value}>
                {role.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="contained"
          onClick={applyFilters}
          sx={{
            borderRadius: '9px',
            textTransform: 'none',
            fontWeight: 700,
            minWidth: '96px',
            backgroundColor: '#2563eb',
            '&:hover': { backgroundColor: '#1d4ed8' }
          }}
        >
          Apply
        </Button>
        <Button
          variant="outlined"
          onClick={resetFilters}
          sx={{
            borderRadius: '9px',
            textTransform: 'none',
            fontWeight: 700,
            minWidth: '96px',
            borderColor: '#cbd5e1',
            color: '#334155',
            '&:hover': { borderColor: '#94a3b8', backgroundColor: '#f8fafc' }
          }}
        >
          Reset
        </Button>
      </Box>

      <Paper sx={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 26px rgba(15, 23, 42, 0.06)', overflow: 'hidden' }}>
        <TableContainer sx={{ backgroundColor: '#ffffff' }}>
          <Table>
            <TableHead sx={{ backgroundColor: '#f8fafc' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Name</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Department</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Created</TableCell>
                <TableCell sx={{ fontWeight: 700, color: '#334155' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow
                  key={user.id}
                  sx={{
                    transition: 'background-color 0.2s ease',
                    '&:hover': { backgroundColor: '#f8fafc' },
                    '&:last-child td': { borderBottom: 0 }
                  }}
                >
                  <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>{user.name}</TableCell>
                  <TableCell sx={{ color: '#334155', fontWeight: 500 }}>{user.email}</TableCell>
                  <TableCell>
                    <Chip
                      label={user.role.replace('_', ' ')}
                      size="small"
                      style={{ backgroundColor: getRoleColor(user.role), color: 'white' }}
                      sx={{ fontWeight: 700, borderRadius: '999px', px: 0.5, minWidth: 92 }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: '#475569' }}>{user.department || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={user.status}
                      size="small"
                      style={{ backgroundColor: getStatusColor(user.status), color: 'white' }}
                      sx={{ fontWeight: 700, borderRadius: '999px', px: 0.5, minWidth: 76 }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: '#334155', fontWeight: 500 }}>
                    {formatDateDDMMYYYY(user.created_at)}
                  </TableCell>
                  <TableCell>
                    <Box
                      display="flex"
                      gap={1}
                      flexWrap="wrap"
                      sx={{
                        p: 0.75,
                        borderRadius: '12px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0'
                      }}
                    >
                    {user.status !== 'INACTIVE' && (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<EditIcon />}
                        onClick={() => openEditDialog(user)}
                        sx={{
                          ...actionTileSx,
                          backgroundColor: '#1d4ed8',
                          '&:hover': { backgroundColor: '#1e40af' }
                        }}
                      >
                        Edit
                      </Button>
                    )}
                    {user.status !== 'INACTIVE' && (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<VpnKeyIcon />}
                        onClick={() => handleResetPassword(user)}
                        sx={{
                          ...actionTileSx,
                          minWidth: '190px',
                          height: '38px',
                          px: 2.5,
                          backgroundColor: '#6d28d9',
                          '&:hover': { backgroundColor: '#5b21b6' }
                        }}
                      >
                        Reset Password
                      </Button>
                    )}
                    {user.status !== 'INACTIVE' && (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<DeleteIcon />}
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        sx={{
                          ...actionTileSx,
                          backgroundColor: '#dc2626',
                          '&:hover': { backgroundColor: '#b91c1c' }
                        }}
                      >
                        Delete
                      </Button>
                    )}
                    {user.status === 'INACTIVE' && (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<CheckCircleIcon />}
                        onClick={() => handleActivateUser(user)}
                        sx={{
                          ...actionTileSx,
                          backgroundColor: '#16a34a',
                          '&:hover': { backgroundColor: '#15803d' }
                        }}
                      >
                        Reactivate
                      </Button>
                    )}
                    {user.status === 'INACTIVE' && (
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<DeleteForeverIcon />}
                        onClick={() => handlePermanentDeleteUser(user)}
                        sx={{
                          ...actionTileSx,
                          minWidth: '185px',
                          backgroundColor: '#b91c1c',
                          '&:hover': { backgroundColor: '#991b1b' }
                        }}
                      >
                        Delete Permanently
                      </Button>
                    )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Create User Dialog */}
      <Dialog open={createDialogOpen} onClose={() => !creatingUser && setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>Create New User</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Name"
              fullWidth
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <TextField
              label="Email"
              type="email"
              fullWidth
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
            <Alert severity="info">
              A secure temporary password will be generated automatically and sent to this user by email.
            </Alert>
            {creatingUser && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Alert severity="warning">
                  Creating user and sending temporary password{'.'.repeat(createProgressStep + 1)}
                </Alert>
                <LinearProgress />
              </Box>
            )}
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={formData.role}
                label="Role"
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                required
              >
                {roles.map((role) => (
                  <MenuItem key={role.value} value={role.value}>
                    {role.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={creatingUser}>Cancel</Button>
          <Button onClick={handleCreateUser} variant="contained" disabled={creatingUser || !formData.name || !formData.email || !formData.role}>
            {creatingUser ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={16} color="inherit" />
                Creating...
              </Box>
            ) : (
              'Create User'
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>Edit User</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Name"
              fullWidth
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
            <TextField
              label="Email"
              type="email"
              fullWidth
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
            />
            <Alert severity="info">
              To reset this user&apos;s password, close this dialog and use the <strong>Reset Password</strong> action.
            </Alert>
            <FormControl fullWidth>
              <InputLabel>Role</InputLabel>
              <Select
                value={formData.role}
                label="Role"
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                required
              >
                {roles.map((role) => (
                  <MenuItem key={role.value} value={role.value}>
                    {role.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancel</Button>
          <Button onClick={handleUpdateUser} variant="contained" disabled={!formData.name || !formData.email || !formData.role}>
            Update User
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmDialog.open}
        onClose={closeConfirmDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle
          sx={{
            fontWeight: 800,
            color: '#0f172a',
            borderBottom: '1px solid #e2e8f0',
            backgroundColor:
              confirmDialog.severity === 'error'
                ? '#fef2f2'
                : confirmDialog.severity === 'warning'
                  ? '#fffbeb'
                  : '#eff6ff'
          }}
        >
          {confirmDialog.title}
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <Alert
            severity={confirmDialog.severity}
            sx={{ mb: 2, borderRadius: '10px' }}
          >
            {confirmDialog.message}
          </Alert>
          {confirmDialog.requireAcknowledge && (
            <FormControlLabel
              control={(
                <Checkbox
                  checked={confirmDialog.acknowledged}
                  onChange={(e) =>
                    setConfirmDialog((prev) => ({ ...prev, acknowledged: e.target.checked }))
                  }
                />
              )}
              label={confirmDialog.acknowledgeText}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1.5 }}>
          <Button
            onClick={closeConfirmDialog}
            disabled={confirmDialog.processing}
            variant="outlined"
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 700 }}
          >
            Cancel
          </Button>
          <Button
            onClick={runConfirmDialog}
            disabled={confirmDialog.processing || (confirmDialog.requireAcknowledge && !confirmDialog.acknowledged)}
            variant="contained"
            color={confirmDialog.severity === 'error' ? 'error' : 'primary'}
            sx={{
              borderRadius: '10px',
              textTransform: 'none',
              fontWeight: 800,
              minWidth: '150px'
            }}
          >
            {confirmDialog.processing ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={14} color="inherit" />
                Processing...
              </Box>
            ) : (
              confirmDialog.confirmText
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      {snackbarNode}
    </Box>
  );
};

export default UserManagement;
