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
  LinearProgress
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

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

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
  };

  const handleActivateUser = async (targetUser: User) => {
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
  };

  const handleResetPassword = async (targetUser: User) => {
    if (!window.confirm(`Generate and email a temporary password to ${targetUser.email}?`)) return;

    try {
      const response = await apiService.users.resetPassword(targetUser.id);
      if (response.success) {
        const successMessage = response.message || 'Password reset successful. Temporary password sent to user email.';
        setSnackbar({
          open: true,
          message: successMessage,
          severity: 'success'
        });
        window.alert(successMessage);
      } else {
        setSnackbar({ open: true, message: response.message || 'Failed to reset password', severity: 'error' });
      }
    } catch (err: any) {
      setSnackbar({ open: true, message: err.response?.data?.message || err.message || 'Failed to reset password', severity: 'error' });
    }
  };

  const handlePermanentDeleteUser = async (targetUser: User) => {
    if (targetUser.status !== 'INACTIVE') {
      setSnackbar({ open: true, message: 'Deactivate the user first before permanent delete', severity: 'error' });
      return;
    }

    if (!window.confirm(`Permanently delete ${targetUser.email}? This cannot be undone.`)) return;

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
    fontWeight: 600,
    minWidth: '120px',
    height: '34px',
    px: 1.5,
    boxShadow: 'none',
    '&:hover': { boxShadow: 'none' }
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
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        User Management
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
        <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
          <Typography variant="body2" color="textSecondary">
            Total Users: {totalUsers}
          </Typography>
          <Typography variant="body2" color="success.main">
            Active Users: {activeUsers}
          </Typography>
          <Typography variant="body2" color="error.main">
            Inactive Users: {inactiveUsers}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateDialogOpen(true)}
        >
          Add User
        </Button>
      </Box>

      <Box
        display="flex"
        gap={2}
        alignItems="center"
        flexWrap="wrap"
        mb={2}
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
        <Button variant="contained" onClick={applyFilters}>
          Apply
        </Button>
        <Button variant="outlined" onClick={resetFilters}>
          Reset
        </Button>
      </Box>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Department</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Chip
                      label={user.role.replace('_', ' ')}
                      size="small"
                      style={{ backgroundColor: getRoleColor(user.role), color: 'white' }}
                    />
                  </TableCell>
                  <TableCell>{user.department || '-'}</TableCell>
                  <TableCell>
                    <Chip
                      label={user.status}
                      size="small"
                      style={{ backgroundColor: getStatusColor(user.status), color: 'white' }}
                    />
                  </TableCell>
                  <TableCell>
                    {formatDateDDMMYYYY(user.created_at)}
                  </TableCell>
                  <TableCell>
                    <Box display="flex" gap={1} flexWrap="wrap">
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
                        onClick={() => handleDeleteUser(user.id)}
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
                        Activate
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
        <DialogTitle>Create New User</DialogTitle>
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
        <DialogTitle>Edit User</DialogTitle>
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

      {/* Snackbar for notifications */}
      {snackbarNode}
    </Box>
  );
};

export default UserManagement;
