const express = require('express');
const { createNotification, getNotifications, markNotificationRead } = require('../controllers/notificationController');
const { authenticate } = require('../utils/auth');

const router = express.Router();

router.post('/', authenticate, createNotification);
router.get('/', authenticate, getNotifications);
router.put('/:notification_id/read', authenticate, markNotificationRead);

module.exports = router;