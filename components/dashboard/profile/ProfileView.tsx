
import { useUser } from "@clerk/react-router";
import { useState, useEffect } from "react";
import Image from "@/web/compat/image";
import { MdOutlineEmail, MdOutlinePerson, MdOutlineCalendarToday, MdOutlineSettings, MdOutlineUpgrade, MdOutlineLock, MdOutlineDeleteForever } from "react-icons/md";
import { useToast } from "@/components/ui/toast";

export default function ProfileView() {
  const { user, isLoaded } = useUser();
  const [plan, setPlan] = useState<string>("free");
  const [loadingPlan, setLoadingPlan] = useState(true);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [authMethods, setAuthMethods] = useState<{ oauth: boolean; oauthProviders: string[] } | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { toast } = useToast();

  // Fetch password status
  useEffect(() => {
    const fetchPasswordStatus = async () => {
      try {
        const response = await fetch("/api/user/password");
        if (response.ok) {
          const data = await response.json();
          setHasPassword(data.hasPassword);
          setAuthMethods(data.authMethods);
        }
      } catch (error) {
        console.error("Failed to fetch password status:", error);
      }
    };

    if (isLoaded && user) {
      fetchPasswordStatus();
    }
  }, [isLoaded, user]);

  // Fetch user plan from database
  useEffect(() => {
    const fetchUserPlan = async () => {
      try {
        const response = await fetch("/api/user/plan");
        if (response.ok) {
          const data = await response.json();
          setPlan(data.plan || "free");
        }
      } catch (error) {
        console.error("Failed to fetch user plan:", error);
      } finally {
        setLoadingPlan(false);
      }
    };

    if (isLoaded && user) {
      fetchUserPlan();
    }
  }, [isLoaded, user]);




  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast('Please select an image file', 'error');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast('Image size must be less than 5MB', 'error');
      return;
    }

    setUploadingPhoto(true);
    try {
      await user.setProfileImage({ file });
      // Clerk automatically updates the user object
    } catch (error: unknown) {
      console.error('Failed to upload photo:', error);
      toast('Failed to upload photo. Please try again.', 'error');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handlePasswordUpdate = async () => {
    setPasswordError(null);

    // Validation - current password only required if user has a password
    if (hasPassword && !passwordForm.currentPassword) {
      setPasswordError("Current password is required");
      return;
    }

    if (!passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError("New password and confirmation are required");
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError("New passwords do not match");
      return;
    }

    if (passwordForm.newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      return;
    }

    setUpdatingPassword(true);
    try {
      // Call API route to set or update password
      const response = await fetch("/api/user/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Only send currentPassword if user has one
          ...(hasPassword && { currentPassword: passwordForm.currentPassword }),
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Success - user now has a password
        setHasPassword(true);
        setShowPasswordModal(false);
        setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setShowCurrentPassword(false);
        setShowNewPassword(false);
        setShowConfirmPassword(false);
        setShowSuccessModal(true);
      } else {
        setPasswordError(data.error || "Failed to update password");
      }
    } catch (error: unknown) {
      console.error("Failed to update password:", error);
      setPasswordError("Failed to update password. Please try again.");
    } finally {
      setUpdatingPassword(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-sm h-8 w-8 border-b-2 border-primary"></div>
        <span className="ml-3 text-muted-foreground">Loading profile...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center p-12">
        <p className="text-muted-foreground">Please sign in to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4 lg:pt-8 flex justify-center">
      <div className="bg-card rounded-sm border border-border shadow-sm overflow-hidden max-w-3xl w-full">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-6 py-8">
          <div className="flex items-center gap-6">
            <div className="relative group">
              {user.imageUrl ? (
                <Image
                  src={user.imageUrl}
                  alt={user.fullName || "User"}
                  width={96}
                  height={96}
                  className="rounded-full border-4 border-background"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center border-4 border-background">
                  <span className="text-3xl font-bold text-primary">
                    {user.firstName?.[0] || user.emailAddresses[0]?.emailAddress[0] || "U"}
                  </span>
                </div>
              )}
              
              {/* Upload Photo Button */}
              <label
                htmlFor="profile-photo-upload"
                className="absolute bottom-0 right-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors shadow-lg"
                title="Upload photo"
              >
                {uploadingPhoto ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </label>
              <input
                id="profile-photo-upload"
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto}
                className="hidden"
              />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-foreground">
                  {user.fullName || "User Profile"}
                </h1>
                {loadingPlan ? (
                  <div className="w-20 h-6 bg-muted animate-pulse rounded-full" />
                ) : (
                  <span className="px-3 py-1 text-xs font-semibold rounded-full bg-primary/10 text-primary border border-primary/20">
                    {plan === "starter" ? "Starter Plan" : plan === "pro" ? "Pro Plan" : plan === "scale" ? "Scale Plan" : "Free Plan"}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground mt-1">
                {user.emailAddresses[0]?.emailAddress}
              </p>
            </div>
          </div>
        </div>

        {/* Profile Information */}
        <div className="px-6 py-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">Profile Information</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <MdOutlinePerson className="text-muted-foreground mt-1" size={20} />
                <div>
                  <p className="text-sm text-muted-foreground">Full Name</p>
                  <p className="text-foreground font-medium">
                    {user.fullName || "Not provided"}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MdOutlineEmail className="text-muted-foreground mt-1" size={20} />
                <div>
                  <p className="text-sm text-muted-foreground">Email Address</p>
                  <p className="text-foreground font-medium">
                    {user.emailAddresses[0]?.emailAddress}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MdOutlineCalendarToday className="text-muted-foreground mt-1" size={20} />
                <div>
                  <p className="text-sm text-muted-foreground">Member Since</p>
                  <p className="text-foreground font-medium">
                    {new Date(user.createdAt!).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Management */}
          <div className="border-t border-border pt-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Subscription</h2>
            <div className="space-y-3">
              {plan !== "free" ? (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    You are currently on the <span className="font-semibold text-foreground">{plan === "starter" ? "Starter" : plan === "pro" ? "Pro" : plan === "scale" ? "Scale" : plan}</span> plan.
                  </p>
                  <button
                    onClick={async () => {
                      setLoadingPortal(true);
                      try {
                        const res = await fetch("/api/polar/portal");
                        if (res.ok) {
                          const { url } = await res.json();
                          window.open(url, "_blank");
                        } else {
                          toast("Unable to open customer portal. Please try again.", "error");
                        }
                      } catch (error) {
                        console.error("Portal error:", error);
                        toast("Unable to open customer portal. Please try again.", "error");
                      } finally {
                        setLoadingPortal(false);
                      }
                    }}
                    disabled={loadingPortal}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                  >
                    <MdOutlineSettings size={18} />
                    {loadingPortal ? "Loading..." : "Manage Subscription"}
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    You are currently on the <span className="font-semibold text-foreground">Free</span> plan. Upgrade to unlock more storage and features.
                  </p>
                  <button
                    onClick={() => {
                      window.location.href = "/pricing";
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-sm hover:bg-primary/90 transition-colors w-full sm:w-auto"
                  >
                    <MdOutlineUpgrade size={18} />
                    View Plans
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Security Section */}
          <div className="border-t border-border pt-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Security</h2>
            <div className="space-y-4">
              {/* Password */}
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div className="flex items-start gap-3">
                  <MdOutlineLock className="text-muted-foreground mt-1" size={20} />
                  <div>
                    <p className="text-sm font-medium text-foreground">Password</p>
                    {hasPassword === null ? (
                      <div className="w-20 h-3 bg-muted animate-pulse rounded mt-1" />
                    ) : hasPassword ? (
                      <p className="text-xs text-muted-foreground mt-0.5">••••••••••</p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Not set {authMethods?.oauth && `(signed in with ${authMethods.oauthProviders.join(", ")})`}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setShowPasswordModal(true)}
                  className="text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  {hasPassword ? "Update password" : "Set password"}
                </button>
              </div>


              {/* Delete Account */}
              <div className="flex items-center justify-between py-3">
                <div className="flex items-start gap-3">
                  <MdOutlineDeleteForever className="text-destructive mt-1" size={20} />
                  <div>
                    <p className="text-sm font-medium text-foreground">Delete account</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Permanently delete your account and all data</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="text-sm text-destructive hover:text-destructive/80 transition-colors"
                >
                  Delete account
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Password Update Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl max-w-md w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              {hasPassword ? "Update Password" : "Set Password"}
            </h3>
            <div className="space-y-4">
              {/* Only show current password field if user has a password */}
              {hasPassword && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Current Password
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                      className="w-full px-3 py-2 pr-10 bg-muted/30 border border-border rounded-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showCurrentPassword ? (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? "text" : "password"}
                    value={passwordForm.newPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                    className="w-full px-3 py-2 pr-10 bg-muted/30 border border-border rounded-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showNewPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    value={passwordForm.confirmPassword}
                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                    className="w-full px-3 py-2 pr-10 bg-muted/30 border border-border rounded-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
                  setPasswordError(null);
                  setShowCurrentPassword(false);
                  setShowNewPassword(false);
                  setShowConfirmPassword(false);
                }}
                disabled={updatingPassword}
                className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-sm transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordUpdate}
                disabled={updatingPassword}
                className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-sm transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {updatingPassword ? (
                  <>
                    <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    {hasPassword ? "Updating..." : "Setting..."}
                  </>
                ) : (
                  hasPassword ? "Update Password" : "Set Password"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col">
              <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <MdOutlineDeleteForever className="text-destructive" size={24} />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Delete Account</h3>
              <p className="text-sm text-muted-foreground mb-6">
                Are you sure you want to delete your account? This action cannot be undone. All your data will be permanently removed.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-muted hover:bg-muted/80 rounded-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    window.open('https://accounts.bucket0.com/user', '_blank');
                  }}
                  className="px-4 py-2 text-sm font-medium text-destructive-foreground bg-destructive hover:bg-destructive/90 rounded-sm transition-colors"
                >
                  Delete Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card border border-border rounded-lg shadow-xl max-w-sm w-full p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Password {hasPassword ? "Updated" : "Set"}!
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Your password has been successfully {hasPassword ? "updated" : "set"}.
              </p>
              <button
                onClick={() => setShowSuccessModal(false)}
                className="w-full px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-sm transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
