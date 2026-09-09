'use strict';

const express = require('express');
const { runOverdueSweep } = require('../jobs/overdueSweep');
const { runDueDateReminderSweep } = require('../jobs/dueDateReminderSweep');
const { runIncompleteRequirementsSweep } = require('../jobs/incompleteRequirementsSweep');

const router = express.Router();

// Invoked once a day by Vercel Cron (see vercel.json's `crons` entry) —
// runs the same three Notification Engine sweeps that server/app.js runs
// hourly via setInterval on a normal always-on host. setInterval doesn't
// survive on Vercel (see the comment in app.js), so this route is the real
// scheduler there instead.
//
// Vercel signs its own Cron invocations with an `Authorization: Bearer
// <CRON_SECRET>` header when the CRON_SECRET env var is set (see
// https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs).
// Without checking it, this path would be a public, unauthenticated way
// for anyone to trigger the sweeps (and their emails/SMS/notifications) on
// demand. If CRON_SECRET isn't set at all, the check is skipped rather
// than locking the route out entirely — matches this app's existing
// "flag it, don't block on it" pattern for optional hardening (see the
// CORS/CSP comments elsewhere in app.js), but you should set it before a
// real deployment.
router.get('/sweep', async (req, res) => {
  if (process.env.CRON_SECRET) {
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (req.headers.authorization !== expected) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
  }

  const jobs = [
    ['overdue', runOverdueSweep],
    ['dueDateReminder', runDueDateReminderSweep],
    ['incompleteRequirements', runIncompleteRequirementsSweep]
  ];
  const results = await Promise.allSettled(jobs.map(([, run]) => run()));

  const failed = [];
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const [name] = jobs[i];
      failed.push(name);
      console.error(`${name} sweep failed:`, result.reason && result.reason.message);
    }
  });

  res.json({ success: true, ranAt: new Date().toISOString(), failed });
});

module.exports = router;
