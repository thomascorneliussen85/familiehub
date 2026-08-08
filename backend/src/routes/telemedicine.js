import { Router } from 'express';
import {
  listDoctors,
  listBookings,
  getAvailableSlots,
  createBooking,
  cancelBooking,
  completeBooking,
} from '../services/telemedicineService.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

router.get('/doctors', (req, res) => {
  res.json(listDoctors());
});

router.get('/slots', (req, res) => {
  const doctorId = Number(req.query.doctorId);
  if (!doctorId) return res.status(400).json({ error: 'doctorId er påkrevd' });
  res.json(getAvailableSlots(doctorId));
});

router.get('/bookings', (req, res) => {
  res.json(listBookings(req.familyId));
});

router.post('/bookings', (req, res) => {
  const { member_id, doctor_id, start_at, reason } = req.body;
  if (!doctor_id || !start_at) {
    return res.status(400).json({ error: 'Lege og tidspunkt er påkrevd' });
  }
  try {
    const booking = createBooking({ familyId: req.familyId, member_id: member_id || null, doctor_id, start_at, reason });
    req.app.get('io').to(`family:${req.familyId}`).emit('telemedicine:update');
    req.app.get('io').to(`family:${req.familyId}`).emit('calendar:update', { type: 'created' });
    res.status(201).json(booking);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/bookings/:id/complete', (req, res) => {
  completeBooking(Number(req.params.id), req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('telemedicine:update');
  res.status(204).end();
});

router.delete('/bookings/:id', (req, res) => {
  cancelBooking(Number(req.params.id), req.familyId);
  req.app.get('io').to(`family:${req.familyId}`).emit('telemedicine:update');
  req.app.get('io').to(`family:${req.familyId}`).emit('calendar:update', { type: 'deleted' });
  res.status(204).end();
});

export default router;
