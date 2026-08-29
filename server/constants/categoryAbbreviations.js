'use strict';

// Used to build item codes for newly generated Items: <ABBR>-<equipmentId>-<sequence>.
// The 17 hand-picked codes seeded before this system existed (e.g. BDM-RKT-3-1) are
// left untouched — this map only governs codes generated going forward.
module.exports = {
  Badminton: 'BDM',
  Baseball: 'BSB',
  Basketball: 'BSK',
  Boxing: 'BOX',
  Chess: 'CHS',
  Football: 'FBL',
  Futsal: 'FUT',
  'Lawn Tennis': 'LTN',
  'Sepak Takraw': 'SPT',
  Softball: 'SFB',
  'Sports Training': 'SPR',
  'Table Tennis': 'TTN',
  Taekwondo: 'TKD',
  Volleyball: 'VBL'
};
