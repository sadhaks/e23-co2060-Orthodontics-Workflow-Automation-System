const crypto = require('crypto');

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '@#$%&*!?';

const randomInt = (max) => crypto.randomInt(0, max);

const pick = (source) => source[randomInt(source.length)];

const shuffle = (arr) => {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const generateTemporaryPassword = (length = 14) => {
  const safeLength = Number.isInteger(length) && length >= 12 ? length : 14;
  const all = `${UPPER}${LOWER}${DIGITS}${SYMBOLS}`;

  const chars = [
    pick(UPPER),
    pick(LOWER),
    pick(DIGITS),
    pick(SYMBOLS)
  ];

  while (chars.length < safeLength) {
    chars.push(pick(all));
  }

  return shuffle(chars).join('');
};

module.exports = {
  generateTemporaryPassword
};
