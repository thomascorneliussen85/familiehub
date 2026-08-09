import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireFamilyPin } from '../middleware/requireFamilyPin.js';
import {
  searchFamilies,
  createFriendRequest,
  listIncomingRequests,
  listOutgoingRequests,
  respondToFriendRequest,
  listLocalFriendFamilies,
  removeLocalFriendPair,
} from '../services/localFriendsService.js';

const router = Router();
router.use(requireAuth);

router.get('/', requireFamilyPin, (req, res) => {
  res.json(listLocalFriendFamilies(req.familyId));
});

router.get('/search', requireFamilyPin, (req, res) => {
  const q = (req.query.q || '').trim();
  if (q.length < 2) return res.json([]);
  res.json(searchFamilies(req.familyId, q));
});

router.get('/requests', requireFamilyPin, (req, res) => {
  res.json({
    incoming: listIncomingRequests(req.familyId),
    outgoing: listOutgoingRequests(req.familyId),
  });
});

router.post('/requests', requireFamilyPin, (req, res) => {
  const toFamilyId = Number(req.body?.toFamilyId);
  if (!toFamilyId) {
    return res.status(400).json({ error: 'Familie er påkrevd' });
  }
  try {
    createFriendRequest(req.familyId, toFamilyId);
    req.app.get('io').to(`family:${toFamilyId}`).emit('local-friends:requests-changed');
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/requests/:id/respond', requireFamilyPin, (req, res) => {
  try {
    const request = respondToFriendRequest(req.familyId, Number(req.params.id), Boolean(req.body?.approve));
    req.app.get('io').to(`family:${request.from_family_id}`).emit('local-friends:requests-changed');
    res.status(204).end();
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:familyId', requireFamilyPin, (req, res) => {
  removeLocalFriendPair(req.familyId, Number(req.params.familyId));
  res.status(204).end();
});

export default router;
