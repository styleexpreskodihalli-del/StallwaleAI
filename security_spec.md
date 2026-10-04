# Security Specification — STore Automation

## 1. Data Invariants
1. **Multi-Tenant Ownership**: Every `Store` document at `/stores/{storeId}` must have `ownerId == request.auth.uid`. Only the owner can read, update, or delete their store.
2. **Relational Subcollection Sync (Master Gate)**: Every `Post`, `Offer`, and `Review` inside `/stores/{storeId}/...` must have `ownerId == request.auth.uid`, `storeId == storeId`, and the parent `/stores/$(storeId)` document must exist and belong to `request.auth.uid`.
3. **Strict Key & Size Enforcement**: Every string field is bounded by maximum character lengths matching `firebase-blueprint.json`. No extra/shadow keys are permitted (`hasOnly`).
4. **Immutable Fields**: `ownerId`, `storeId`, and `createdAt` can never be modified during updates.
5. **Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`.

## 2. The "Dirty Dozen" Payloads
1. **Shadow Field Injection on Store**: Adding `"isAdmin": true` to `/stores/{storeId}`.
2. **Cross-Tenant Store Read**: User B attempting `get` or `list` on User A's `/stores/{storeId}`.
3. **Identity Spoofing on Create**: User A creating a store with `ownerId: "user_b"`.
4. **ID Poisoning**: Creating a document with a 500-character or special-character ID.
5. **Unverified Email Write**: Attempting to create a store when `request.auth.token.email_verified == false`.
6. **Orphaned Subcollection Write**: Creating a post under `/stores/{nonExistentStoreId}/posts/{postId}`.
7. **Cross-Store Subcollection Injection**: Creating a post in `/stores/storeA/posts/p1` with `storeId: "storeB"`.
8. **Immortal Field Mutation**: Updating `createdAt` or `ownerId` on an existing Store or Post.
9. **Client Timestamp Forgery**: Sending a past or future timestamp for `updatedAt` instead of `request.time`.
10. **Enum Violation**: Setting `category: "InvalidCategory"` on Store or `status: "Hacked"` on Offer.
11. **Oversized String Denial-of-Wallet**: Sending a 10,000-character `description` on a Post.
12. **Blanket List Query Scraping**: Executing an unfiltered `list` query on `/stores` without `where('ownerId', '==', uid)`.
