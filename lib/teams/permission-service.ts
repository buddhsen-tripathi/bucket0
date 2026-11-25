/**
 * Team Permission Service
 * Handles flexible permission checking for team members
 *
 * Permission Model:
 * - Owner: Has ALL permissions automatically (cannot be restricted)
 * - Members: Can have individual permissions OR be assigned a custom role
 * - Roles: Permission bundles created by owner for bulk assignment
 */

import { db } from "@/lib/shared/db";
import { teams, teamMembers, teamRoles } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export enum Permission {
  UPLOAD = "canUpload",
  DOWNLOAD = "canDownload",
  DELETE = "canDelete",
  SHARE = "canShare",
  MANAGE_MEMBERS = "canManageMembers",
  VIEW_ACTIVITY = "canViewActivity",
  CHAT = "canChat",
}

// Owner-only permissions (not stored in teamMembers)
export enum OwnerPermission {
  MANAGE_BILLING = "canManageBilling",
  DELETE_TEAM = "canDeleteTeam",
  TRANSFER_OWNERSHIP = "canTransferOwnership",
  MANAGE_ROLES = "canManageRoles",
}

export interface MemberPermissions {
  canUpload: boolean;
  canDownload: boolean;
  canDelete: boolean;
  canShare: boolean;
  canManageMembers: boolean;
  canViewActivity: boolean;
  canChat: boolean;
  // Owner-only
  canManageBilling: boolean;
  canDeleteTeam: boolean;
  canTransferOwnership: boolean;
  canManageRoles: boolean;
  // Meta
  isOwner: boolean;
}

const DEFAULT_MEMBER_PERMISSIONS: Omit<MemberPermissions, "isOwner"> = {
  canUpload: true,
  canDownload: true,
  canDelete: false,
  canShare: true,
  canManageMembers: false,
  canViewActivity: false,
  canChat: true,
  canManageBilling: false,
  canDeleteTeam: false,
  canTransferOwnership: false,
  canManageRoles: false,
};

const OWNER_PERMISSIONS: MemberPermissions = {
  canUpload: true,
  canDownload: true,
  canDelete: true,
  canShare: true,
  canManageMembers: true,
  canViewActivity: true,
  canChat: true,
  canManageBilling: true,
  canDeleteTeam: true,
  canTransferOwnership: true,
  canManageRoles: true,
  isOwner: true,
};

export class PermissionService {
  /**
   * Check if user is the team owner
   */
  async isTeamOwner(teamId: string, userId: string): Promise<boolean> {
    const [team] = await db
      .select({ ownerId: teams.ownerId })
      .from(teams)
      .where(eq(teams.id, teamId))
      .limit(1);

    return team?.ownerId === userId;
  }

  /**
   * Get team member record
   */
  async getTeamMember(teamId: string, userId: string) {
    const [member] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .limit(1);

    return member;
  }

  /**
   * Get role by ID
   */
  async getRole(roleId: string) {
    const [role] = await db
      .select()
      .from(teamRoles)
      .where(eq(teamRoles.id, roleId))
      .limit(1);

    return role;
  }

  /**
   * Get all permissions for a team member
   * Owner always gets full permissions
   * Members get permissions from their role or individual settings
   */
  async getMemberPermissions(teamId: string, userId: string): Promise<MemberPermissions | null> {
    // First check if user is team owner
    const isOwner = await this.isTeamOwner(teamId, userId);
    if (isOwner) {
      return OWNER_PERMISSIONS;
    }

    // Get member record
    const member = await this.getTeamMember(teamId, userId);
    if (!member) {
      return null; // Not a team member
    }

    // Get role if assigned
    let rolePermissions = null;
    if (member.roleId) {
      rolePermissions = await this.getRole(member.roleId);
    }

    // Build permissions: member overrides role, role overrides defaults
    return {
      canUpload: member.canUpload ?? rolePermissions?.canUpload ?? DEFAULT_MEMBER_PERMISSIONS.canUpload,
      canDownload: member.canDownload ?? rolePermissions?.canDownload ?? DEFAULT_MEMBER_PERMISSIONS.canDownload,
      canDelete: member.canDelete ?? rolePermissions?.canDelete ?? DEFAULT_MEMBER_PERMISSIONS.canDelete,
      canShare: member.canShare ?? rolePermissions?.canShare ?? DEFAULT_MEMBER_PERMISSIONS.canShare,
      canManageMembers: member.canManageMembers ?? rolePermissions?.canManageMembers ?? DEFAULT_MEMBER_PERMISSIONS.canManageMembers,
      canViewActivity: member.canViewActivity ?? rolePermissions?.canViewActivity ?? DEFAULT_MEMBER_PERMISSIONS.canViewActivity,
      canChat: member.canChat ?? rolePermissions?.canChat ?? DEFAULT_MEMBER_PERMISSIONS.canChat,
      // Owner-only permissions are always false for non-owners
      canManageBilling: false,
      canDeleteTeam: false,
      canTransferOwnership: false,
      canManageRoles: false,
      isOwner: false,
    };
  }

  /**
   * Check if user has a specific permission in a team
   */
  async hasPermission(teamId: string, userId: string, permission: Permission): Promise<boolean> {
    const permissions = await this.getMemberPermissions(teamId, userId);
    if (!permissions) {
      return false;
    }
    return permissions[permission];
  }

  /**
   * Check if user is the team owner (required for owner-only actions)
   */
  async hasOwnerPermission(teamId: string, userId: string): Promise<boolean> {
    return this.isTeamOwner(teamId, userId);
  }

  /**
   * Require a permission or throw an error
   */
  async requirePermission(teamId: string, userId: string, permission: Permission): Promise<void> {
    const hasPermission = await this.hasPermission(teamId, userId, permission);
    if (!hasPermission) {
      throw new Error(`Permission denied: ${permission}`);
    }
  }

  /**
   * Require owner permission or throw an error
   */
  async requireOwnerPermission(teamId: string, userId: string, permission: OwnerPermission): Promise<void> {
    const isOwner = await this.hasOwnerPermission(teamId, userId);
    if (!isOwner) {
      throw new Error(`Permission denied: ${permission} (owner only)`);
    }
  }

  /**
   * Check if user is a member of a team (owner OR member)
   */
  async isTeamMember(teamId: string, userId: string): Promise<boolean> {
    // Check if owner
    const isOwner = await this.isTeamOwner(teamId, userId);
    if (isOwner) {
      return true;
    }

    // Check if member
    const member = await this.getTeamMember(teamId, userId);
    return member !== undefined;
  }

  /**
   * Get all teams user is a member of (as owner or member)
   */
  async getUserTeams(userId: string) {
    // Get teams where user is owner
    const ownedTeams = await db
      .select()
      .from(teams)
      .where(eq(teams.ownerId, userId));

    // Get teams where user is member
    const memberTeams = await db
      .select({
        team: teams,
        membership: teamMembers,
      })
      .from(teamMembers)
      .innerJoin(teams, eq(teamMembers.teamId, teams.id))
      .where(eq(teamMembers.userId, userId));

    return {
      owned: ownedTeams,
      memberOf: memberTeams.map((t) => ({
        ...t.team,
        membership: t.membership,
      })),
    };
  }

  /**
   * Check multiple permissions at once
   */
  async hasPermissions(
    teamId: string,
    userId: string,
    requiredPermissions: Permission[]
  ): Promise<{ hasAll: boolean; missing: Permission[] }> {
    const permissions = await this.getMemberPermissions(teamId, userId);
    if (!permissions) {
      return { hasAll: false, missing: requiredPermissions };
    }

    const missing = requiredPermissions.filter((p) => !permissions[p]);
    return {
      hasAll: missing.length === 0,
      missing,
    };
  }
}

export const permissionService = new PermissionService();
