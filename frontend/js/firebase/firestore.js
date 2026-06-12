/**
 * firebase/firestore.js — Firestore Database Service
 * ────────────────────────────────────────────────────
 * Complete CRUD + real-time listeners + pagination for Firestore.
 * Exposes: window.FirestoreService
 *
 * Collections used in this app:
 *   narratives/   — mirrors SQLite for cloud sync & sharing
 *   users/        — user profiles & preferences
 *   feedback/     — ratings (denormalised for analytics)
 */

window.FirestoreService = (() => {
  // ── Guard ───────────────────────────────────────────────────
  function _assert() {
    if (!firebaseDb) throw new Error('Firestore is not initialized. Check config.js.');
  }

  // ── Helpers ─────────────────────────────────────────────────
  /** Convert Firestore Timestamp → ISO string */
  function _toIso(val) {
    if (!val) return null;
    if (val.toDate) return val.toDate().toISOString();
    return val;
  }

  /** Convert Firestore DocumentSnapshot → plain object */
  function _docToObj(doc) {
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  /** Serialize before write: remove undefined, convert Dates */
  function _clean(obj) {
    return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v)));
  }

  // ══════════════════════════════════════════════════════════════
  //  GENERIC CRUD — work with any collection
  // ══════════════════════════════════════════════════════════════

  /**
   * Create a document with auto-generated ID.
   * Returns: { id, error }
   */
  async function createDocument(collectionName, data) {
    _assert();
    try {
      const ref  = await firebaseDb.collection(collectionName).add({
        ..._clean(data),
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      return { id: ref.id, error: null };
    } catch (e) {
      console.error(`Firestore createDocument [${collectionName}]:`, e);
      return { id: null, error: e.message };
    }
  }

  /**
   * Create / overwrite a document with a specific ID.
   * Returns: { error }
   */
  async function setDocument(collectionName, docId, data, merge = true) {
    _assert();
    try {
      await firebaseDb.collection(collectionName).doc(docId).set({
        ..._clean(data),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge });
      return { error: null };
    } catch (e) {
      console.error(`Firestore setDocument [${collectionName}/${docId}]:`, e);
      return { error: e.message };
    }
  }

  /**
   * Read a single document by ID.
   * Returns: { data, error }
   */
  async function readDocument(collectionName, docId) {
    _assert();
    try {
      const snap = await firebaseDb.collection(collectionName).doc(docId).get();
      if (!snap.exists) return { data: null, error: null };
      return { data: _docToObj(snap), error: null };
    } catch (e) {
      console.error(`Firestore readDocument [${collectionName}/${docId}]:`, e);
      return { data: null, error: e.message };
    }
  }

  /**
   * Update specific fields in a document (merge).
   * Returns: { error }
   */
  async function updateDocument(collectionName, docId, updates) {
    _assert();
    try {
      await firebaseDb.collection(collectionName).doc(docId).update({
        ..._clean(updates),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      return { error: null };
    } catch (e) {
      console.error(`Firestore updateDocument [${collectionName}/${docId}]:`, e);
      return { error: e.message };
    }
  }

  /**
   * Delete a document by ID.
   * Returns: { error }
   */
  async function deleteDocument(collectionName, docId) {
    _assert();
    try {
      await firebaseDb.collection(collectionName).doc(docId).delete();
      return { error: null };
    } catch (e) {
      console.error(`Firestore deleteDocument [${collectionName}/${docId}]:`, e);
      return { error: e.message };
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  QUERY COLLECTIONS
  // ══════════════════════════════════════════════════════════════

  /**
   * Query a collection with optional filters/sort/limit.
   *
   * @param {string} collectionName
   * @param {Array}  filters   — [['field', 'op', value], ...]
   * @param {Object} options   — { orderBy, direction, limit }
   * Returns: { data: [], error }
   */
  async function queryCollection(collectionName, filters = [], options = {}) {
    _assert();
    try {
      let ref = firebaseDb.collection(collectionName);

      // Apply where clauses
      filters.forEach(([field, op, value]) => {
        ref = ref.where(field, op, value);
      });

      // Apply ordering
      if (options.orderBy) {
        ref = ref.orderBy(options.orderBy, options.direction || 'asc');
      }

      // Apply limit
      if (options.limit) {
        ref = ref.limit(options.limit);
      }

      const snap = await ref.get();
      const data = snap.docs.map(_docToObj);
      return { data, error: null };
    } catch (e) {
      console.error(`Firestore queryCollection [${collectionName}]:`, e);
      return { data: [], error: e.message };
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  PAGINATION
  // ══════════════════════════════════════════════════════════════

  /** Cursor-based pagination state per collection */
  const _cursors = {};

  /**
   * Get first page of a collection.
   * Returns: { data, hasMore, error }
   */
  async function getFirstPage(collectionName, orderByField, direction = 'desc', pageSize = 12) {
    _assert();
    try {
      const snap = await firebaseDb.collection(collectionName)
        .orderBy(orderByField, direction)
        .limit(pageSize)
        .get();

      const data = snap.docs.map(_docToObj);
      _cursors[collectionName] = snap.docs[snap.docs.length - 1] || null;

      return { data, hasMore: snap.docs.length === pageSize, error: null };
    } catch (e) {
      console.error(`Firestore getFirstPage [${collectionName}]:`, e);
      return { data: [], hasMore: false, error: e.message };
    }
  }

  /**
   * Get next page using cursor from previous call.
   * Returns: { data, hasMore, error }
   */
  async function getNextPage(collectionName, orderByField, direction = 'desc', pageSize = 12) {
    _assert();
    const lastDoc = _cursors[collectionName];
    if (!lastDoc) return { data: [], hasMore: false, error: null };

    try {
      const snap = await firebaseDb.collection(collectionName)
        .orderBy(orderByField, direction)
        .startAfter(lastDoc)
        .limit(pageSize)
        .get();

      const data = snap.docs.map(_docToObj);
      _cursors[collectionName] = snap.docs[snap.docs.length - 1] || null;

      return { data, hasMore: snap.docs.length === pageSize, error: null };
    } catch (e) {
      console.error(`Firestore getNextPage [${collectionName}]:`, e);
      return { data: [], hasMore: false, error: e.message };
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  REAL-TIME LISTENERS
  // ══════════════════════════════════════════════════════════════

  /**
   * Listen to a single document in real-time.
   * Returns: unsubscribe function
   */
  function listenDocument(collectionName, docId, callback) {
    _assert();
    return firebaseDb.collection(collectionName).doc(docId).onSnapshot(
      (snap) => callback({ data: _docToObj(snap), error: null }),
      (e)    => callback({ data: null, error: e.message })
    );
  }

  /**
   * Listen to a collection query in real-time.
   * Returns: unsubscribe function
   */
  function listenCollection(collectionName, filters = [], options = {}, callback) {
    _assert();
    let ref = firebaseDb.collection(collectionName);

    filters.forEach(([field, op, value]) => {
      ref = ref.where(field, op, value);
    });
    if (options.orderBy) ref = ref.orderBy(options.orderBy, options.direction || 'asc');
    if (options.limit)   ref = ref.limit(options.limit);

    return ref.onSnapshot(
      (snap) => callback({ data: snap.docs.map(_docToObj), error: null }),
      (e)    => callback({ data: [], error: e.message })
    );
  }

  // ══════════════════════════════════════════════════════════════
  //  APP-SPECIFIC: Narratives Collection
  // ══════════════════════════════════════════════════════════════

  /**
   * Save a generated narrative to Firestore (cloud backup of SQLite row).
   * Saves ALL generated fields so the detail modal can display complete information.
   * Called after successful generation.
   */
  async function saveNarrative(narrativeData) {
    return createDocument('narratives', {
      // Core identification
      driverName:       narrativeData.driverName       || null,
      route:            narrativeData.route            || null,
      startingLocation: narrativeData.startingLocation || null,
      destination:      narrativeData.destination      || null,
      // Trip details
      landmarks:        narrativeData.landmarks        || null,
      highlights:       narrativeData.highlights       || null,
      tripDate:         narrativeData.tripDate         || null,
      vehicleType:      narrativeData.vehicleType      || 'Sedan',
      // Style
      tone:             narrativeData.tone             || narrativeData.mood || 'Adventurous',
      mood:             narrativeData.mood             || narrativeData.tone || 'Adventurous',
      style:            narrativeData.style            || 'Adventure',
      // Generated content
      title:            narrativeData.title            || null,
      narrative:        narrativeData.narrative        || null,
      summary:          narrativeData.summary          || null,
      socialCaption:    narrativeData.socialCaption    || null,
      // Quality metrics
      wordCount:        narrativeData.wordCount        || null,
      charCount:        narrativeData.charCount        || null,
      // Linking
      sqliteId:         narrativeData.sqliteId         || narrativeData.id || null,
      userId:           narrativeData.userId           || null,
      // Soft-delete flag (default: not deleted)
      isDeleted:        false,
      deletedAt:        null,
      // Status
      status:           'active',
      // Rating (filled in later)
      rating:           null,
      comment:          null,
    });
  }

  /**
   * Update rating on a narrative document.
   */
  async function rateNarrative(firestoreId, rating, comment = '') {
    return updateDocument('narratives', firestoreId, { rating, comment });
  }

  /**
   * Soft-delete a narrative document.
   * Sets isDeleted = true and records deletedAt timestamp.
   * The Firestore document is PRESERVED and can be recovered.
   * The real-time listener will automatically exclude it via client-side filter.
   */
  async function deleteNarrative(firestoreId) {
    return updateDocument('narratives', firestoreId, {
      isDeleted: true,
      deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
      status:    'archived',
    });
  }

  /**
   * Update narrative fields (title, narrative text, etc.).
   */
  async function updateNarrative(firestoreId, updates) {
    return updateDocument('narratives', firestoreId, updates);
  }

  /**
   * Real-time listener: subscribe to all active (non-deleted) narratives for a given user.
   * Ordered by createdAt DESC.
   * Filters out documents where isDeleted === true client-side
   * (Firestore inequality query on two fields requires a composite index,
   *  so we filter isDeleted client-side for simplicity).
   * Returns: unsubscribe function.
   *
   * @param {string}   userId   — Firebase UID
   * @param {Function} callback — called with { data: [], error }
   */
  function listenUserNarratives(userId, callback) {
    _assert();
    if (!userId) {
      callback({ data: [], error: 'No userId provided.' });
      return () => {};
    }
    return firebaseDb
      .collection('narratives')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .onSnapshot(
        (snap) => {
          // Filter out soft-deleted documents client-side
          const data = snap.docs
            .map(_docToObj)
            .filter(doc => !doc.isDeleted);
          callback({ data, error: null });
        },
        (e) => callback({ data: [], error: e.message })
      );
  }

  // ══════════════════════════════════════════════════════════════
  //  APP-SPECIFIC: User Profiles
  // ══════════════════════════════════════════════════════════════

  /**
   * Create or update user profile in Firestore after sign-in.
   */
  async function syncUserProfile(user) {
    if (!user) return { error: 'No user provided.' };
    return setDocument('users', user.uid, {
      uid:           user.uid,
      email:         user.email,
      displayName:   user.displayName || '',
      photoURL:      user.photoURL    || '',
      emailVerified: user.emailVerified,
      lastSignIn:    firebase.firestore.FieldValue.serverTimestamp(),
    }, true);
  }

  /**
   * Get user profile from Firestore.
   */
  async function getUserProfile(uid) {
    return readDocument('users', uid);
  }

  // ── Public API ─────────────────────────────────────────────
  return {
    // Generic CRUD
    createDocument,
    setDocument,
    readDocument,
    updateDocument,
    deleteDocument,
    // Query
    queryCollection,
    // Pagination
    getFirstPage,
    getNextPage,
    // Real-time
    listenDocument,
    listenCollection,
    // App-specific narratives
    saveNarrative,
    rateNarrative,
    deleteNarrative,
    updateNarrative,
    listenUserNarratives,
    // App-specific users
    syncUserProfile,
    getUserProfile,
    // Utility
    serverTimestamp: () => firebase.firestore.FieldValue.serverTimestamp(),
  };
})();
