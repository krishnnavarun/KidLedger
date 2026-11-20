import { User } from '../models/User.js';
import { FamilyLink } from '../models/FamilyLink.js';
import { Wallet } from '../models/Wallet.js';
import { AppError } from '../middleware/errorHandler.js';

export class FamilyService {
  /**
   * Parent creates and links a child account.
   */
  static async createChildAccount(parentId, { name, email, password, dateOfBirth }) {
    // 1. Verify parent exists and is a parent
    const parent = await User.findById(parentId);
    if (!parent || parent.role !== 'parent') {
      throw new AppError('Only registered parents can create child accounts', 403, 'FORBIDDEN');
    }

    // 2. Validate child email uniqueness
    const existing = await User.findOne({ email });
    if (existing) {
      throw new AppError('An account with this email already exists', 409, 'EMAIL_EXISTS');
    }

    // 3. Parse date of birth if provided
    const dob = dateOfBirth ? new Date(dateOfBirth) : null;

    // 4. Hash password and create child
    const passwordHash = await User.hashPassword(password);
    const child = await User.create({
      name,
      email,
      passwordHash,
      role: 'child',
      dateOfBirth: dob,
    });

    // 5. Establish FamilyLink record (captures parental consent)
    const link = await FamilyLink.create({
      parentId,
      childId: child._id,
      status: 'active',
      consentGivenAt: new Date(),
    });

    // 6. Create Child Wallet
    const wallet = await Wallet.create({
      ownerId: child._id,
      type: 'child',
      balance: 0,
    });

    return {
      child,
      familyLink: link,
      wallet,
    };
  }

  /**
   * Retrieves all linked children for a parent.
   */
  static async getChildren(parentId) {
    const links = await FamilyLink.find({ parentId, status: 'active' }).populate({
      path: 'childId',
      select: 'name email role dateOfBirth createdAt',
    });

    return links
      .filter((link) => link.childId)
      .map((link) => ({
        id: link.childId._id.toString(),
        name: link.childId.name,
        email: link.childId.email,
        dateOfBirth: link.childId.dateOfBirth,
        role: link.childId.role,
        linkedAt: link.consentGivenAt,
      }));
  }

  /**
   * Verifies that a parent has active custody/guardianship over a given child.
   */
  static async verifyParentChildAccess(parentId, childId) {
    const link = await FamilyLink.findOne({
      parentId,
      childId,
      status: 'active',
    });

    if (!link) {
      throw new AppError(
        'Unauthorized: You do not have an active parental link to this child',
        403,
        'PARENT_CHILD_ACCESS_DENIED'
      );
    }

    return link;
  }
}
