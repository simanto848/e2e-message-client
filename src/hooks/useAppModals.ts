import { useCallback, useState } from 'react';

/**
 * App-level modal visibility state, extracted from App.tsx.
 *
 * Pure UI booleans with no crypto/socket coupling — safe to hoist. The
 * hardware back-handler and settings screen drive these through the same
 * setters, so behavior is unchanged. `closeAllModals` gives the back-handler
 * and wipe flows one call instead of N setters.
 */
export function useAppModals() {
  const [showInvitesModal, setShowInvitesModal] = useState(false);
  const [showLinkedDevicesModal, setShowLinkedDevicesModal] = useState(false);
  const [showCloudBackupModal, setShowCloudBackupModal] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showRequestsModal, setShowRequestsModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [showUpdateModal, setShowUpdateModal] = useState(false);

  const closeAllModals = useCallback(() => {
    setShowInvitesModal(false);
    setShowLinkedDevicesModal(false);
    setShowCloudBackupModal(false);
    setShowEditProfileModal(false);
    setShowChangePasswordModal(false);
    setShowRequestsModal(false);
    setShowSearchModal(false);
    setShowPermissionsModal(false);
    setShowUpdateModal(false);
  }, []);

  return {
    showInvitesModal,
    setShowInvitesModal,
    showLinkedDevicesModal,
    setShowLinkedDevicesModal,
    showCloudBackupModal,
    setShowCloudBackupModal,
    showEditProfileModal,
    setShowEditProfileModal,
    showChangePasswordModal,
    setShowChangePasswordModal,
    showRequestsModal,
    setShowRequestsModal,
    showSearchModal,
    setShowSearchModal,
    showPermissionsModal,
    setShowPermissionsModal,
    showUpdateModal,
    setShowUpdateModal,
    closeAllModals,
  };
}

export type AppModals = ReturnType<typeof useAppModals>;
