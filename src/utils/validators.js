const COMMON_EMAIL_TYPOS = ['gmial.com', 'gamil.com', 'yaho.com', 'hotmial.com', 'outlok.com'];

export function validateRegistrationForm({
  firstName,
  lastName,
  email,
  phone,
  streetAddress,
  city,
  postalCode,
  password,
}) {
  const errors = {};

  // 1. First & Last Name Validation (Letters, accents, spaces, hyphens, min 2 chars)
  const nameRegex = /^[A-Za-zÀ-ÖØ-öø-ÿ' -]{2,40}$/;
  if (!firstName || !nameRegex.test(firstName.trim())) {
    errors.firstName = 'Enter a valid first name (at least 2 letters, no numbers).';
  }
  if (!lastName || !nameRegex.test(lastName.trim())) {
    errors.lastName = 'Enter a valid last name (at least 2 letters, no numbers).';
  }

  // 2. Email Validation + Domain Typo Protection
  const cleanEmail = (email || '').trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(cleanEmail)) {
    errors.email = 'Enter a valid email address (e.g., name@example.com).';
  } else {
    const domain = cleanEmail.split('@')[1];
    if (COMMON_EMAIL_TYPOS.includes(domain)) {
      errors.email = `Did you mistype "${domain}"? Please double-check your email domain.`;
    }
  }

  // 3. Phone Validation (North American 10-digit check, strips spaces/dashes)
  const digitsOnly = (phone || '').replace(/\D/g, '');
  const normalizedPhone =
    digitsOnly.length === 11 && digitsOnly.startsWith('1') ? digitsOnly.slice(1) : digitsOnly;

  if (normalizedPhone.length !== 10 || /^[01]/.test(normalizedPhone)) {
    errors.phone = 'Enter a valid 10-digit phone number (e.g., 514-555-0199).';
  }

  // 4. Street Address Validation (Must include a street number and street name)
  const cleanStreet = (streetAddress || '').trim();
  const streetRegex = /^\d+\s+[A-Za-zÀ-ÖØ-öø-ÿ0-9.' -]{3,}$/;
  if (!streetRegex.test(cleanStreet)) {
    errors.streetAddress =
      'Include both street number and street name (e.g., 1250 Boulevard René-Lévesque).';
  }

  // 5. City Validation
  if (!city || city.trim().length < 2) {
    errors.city = 'Enter your city or borough (e.g., Montreal, Laval, Longueuil, Brossard).';
  }

  // 6. Canadian / Quebec Postal Code Validation (Format: H2X 1Y4 or J4Z 2A1)
  const cleanPostal = (postalCode || '').trim().toUpperCase().replace(/\s+/g, '');
  const postalRegex = /^[GHJ][0-9][A-Z][0-9][A-Z][0-9]$/;
  if (!postalRegex.test(cleanPostal)) {
    errors.postalCode =
      'Enter a valid Quebec postal code starting with H, J, or G (e.g., H3A 1B2).';
  }

  // 7. Password Validation
  if (!password || password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    formattedPhone:
      normalizedPhone.length === 10
        ? `(${normalizedPhone.slice(0, 3)}) ${normalizedPhone.slice(3, 6)}-${normalizedPhone.slice(6)}`
        : phone,
    formattedPostalCode:
      cleanPostal.length === 6 ? `${cleanPostal.slice(0, 3)} ${cleanPostal.slice(3)}` : postalCode,
  };
}

export function validateOrderSubmission({ brand, productUrl, itemName, itemSize, itemPrice }) {
  const errors = {};

  if (!brand) {
    errors.brand = 'Please choose a clothing brand.';
  }

  try {
    const parsedUrl = new URL(productUrl);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      errors.productUrl = 'Link must start with https://';
    } else if (brand && !parsedUrl.hostname.toLowerCase().includes(brand.domain)) {
      errors.productUrl = `This link does not match ${brand.name} (${brand.domain}). Please paste a link from ${brand.domain}.`;
    }
  } catch {
    errors.productUrl = 'Please paste a complete, valid product URL starting with https://';
  }

  if (!itemName || itemName.trim().length < 3) {
    errors.itemName = 'Enter the exact item name as shown on the store page.';
  }

  if (!itemSize || itemSize.trim().length < 1) {
    errors.itemSize = 'Specify your size (e.g., S, M, L, 32x30, EU 41).';
  }

  const numericPrice = Number(itemPrice);
  if (!itemPrice || Number.isNaN(numericPrice) || numericPrice <= 0 || numericPrice > 2500) {
    errors.itemPrice = 'Enter a valid item price in CAD (between $1 and $2,500).';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}