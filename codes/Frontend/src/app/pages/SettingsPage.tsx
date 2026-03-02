import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, Button, Input } from '../components/UI';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';

export function SettingsPage() {
  const navigate = useNavigate();
  const { logout, user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const validate = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      return 'All password fields are required.';
    }

    if (newPassword !== confirmPassword) {
      return 'New password and confirmation do not match.';
    }

    if (newPassword === currentPassword) {
      return 'New password must be different from current password.';
    }

    const strongPassword = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
    if (!strongPassword.test(newPassword)) {
      return 'New password must be at least 8 characters with uppercase, lowercase, and number.';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      await apiService.auth.changePassword({
        currentPassword,
        newPassword
      });

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password changed successfully. Please sign in again.');

      setTimeout(async () => {
        await logout();
        navigate('/login', { replace: true });
      }, 1000);
    } catch (err: any) {
      setError(err?.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Card className="p-8">
        <h2 className="text-2xl font-bold mb-2">Settings</h2>
        <p className="text-gray-500 mb-6">
          {user?.must_change_password
            ? 'You must change your temporary password before continuing.'
            : 'Change your account password.'}
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {success}
          </div>
        )}

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <Input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              autoComplete="current-password"
            />
          </div>

          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label htmlFor="confirm-new-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <Input
              id="confirm-new-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              autoComplete="new-password"
            />
          </div>

          <div className="pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
