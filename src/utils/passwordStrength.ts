/**
 * Lightweight, zero-dependency password entropy & strength evaluator.
 * Evaluates character diversity, length, common sequences, and repetition
 * without the heavy bundle size of full dictionary-based packages.
 */

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4; // 0 (Very Weak) to 4 (Very Strong)
  label: string;
  color: string;
  feedback: string;
}

const COMMON_PATTERNS = [
  '1234',
  '2345',
  '3456',
  '4567',
  '5678',
  '6789',
  '7890',
  '0000',
  '1111',
  '2222',
  '3333',
  '4444',
  '5555',
  '6666',
  '7777',
  '8888',
  '9999',
  '1212',
  '1313',
  '6969',
  'password',
  'admin',
  'qwerty',
  'asdf',
  'letmein',
];

export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (!password || password.length === 0) {
    return {
      score: 0,
      label: 'Enter password',
      color: '#94a3b8',
      feedback: 'Choose at least 4 characters.',
    };
  }

  const lower = password.toLowerCase();

  // Check common weak patterns
  for (const pattern of COMMON_PATTERNS) {
    if (lower.includes(pattern) && password.length <= pattern.length + 2) {
      return {
        score: 0,
        label: 'Very Weak',
        color: '#ef4444',
        feedback: 'Too predictable. Avoid common numbers or sequences.',
      };
    }
  }

  // Calculate diversity score
  let poolSize = 0;
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);

  if (hasLower) poolSize += 26;
  if (hasUpper) poolSize += 26;
  if (hasDigit) poolSize += 10;
  if (hasSymbol) poolSize += 33;

  // Bits of entropy: log2(poolSize^length) = length * log2(poolSize)
  const entropy = password.length * Math.log2(Math.max(poolSize, 2));

  // Score mapping
  if (password.length < 4) {
    return {
      score: 0,
      label: 'Too Short',
      color: '#ef4444',
      feedback: 'Minimum 4 characters required.',
    };
  }

  if (entropy < 25 || password.length < 5) {
    return {
      score: 1,
      label: 'Weak',
      color: '#f97316',
      feedback: 'Add letters, numbers, or symbols for better defense.',
    };
  }

  if (entropy < 45 || password.length < 7) {
    return {
      score: 2,
      label: 'Fair',
      color: '#eab308',
      feedback: 'Good, but longer passphrases resist brute-forcing better.',
    };
  }

  if (entropy < 65 || password.length < 10) {
    return {
      score: 3,
      label: 'Strong',
      color: '#10b981',
      feedback: 'Solid security level.',
    };
  }

  return {
    score: 4,
    label: 'Very Strong',
    color: '#059669',
    feedback: 'Excellent zero-knowledge enclave defense!',
  };
}
