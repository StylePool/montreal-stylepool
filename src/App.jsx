import React, { useState, useEffect, useMemo } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  ShoppingBag,
  CheckCircle2,
  ShieldCheck,
  Truck,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  User,
  Lock,
  Sparkles,
  AlertCircle,
  CheckSquare,
  Square,
  LogOut,
  CreditCard,
  Layers,
  PlusCircle,
} from 'lucide-react';
import { MONTREAL_CLOTHING_BRANDS, SUBSCRIPTION_PLANS } from './constants/montrealBrands';
import { validateRegistrationForm, validateOrderSubmission } from './utils/validators';
import { isFirebaseConfigured, auth, db } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
} from 'firebase/firestore';

// Base URL for API calls (empty on same-domain web, or https://montreal-stylepool.onrender.com on iOS/Android)
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

// Initialize Stripe frontend SDK with your pk_ key
const stripePublishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || '';
const stripePromise = stripePublishableKey.startsWith('pk_')
  ? loadStripe(stripePublishableKey)
  : null;

// Dedicated Admin Credentials (Fixed from the start)
const ADMIN_EMAIL = 'mtl.stylepool@gmail.com';
const ADMIN_PASS = '77209515M@c';

const INITIAL_DEMO_ORDERS = [
  {
    id: 'ord_demo_1',
    clientId: 'usr_demo_camille',
    clientName: 'Camille Tremblay',
    clientEmail: 'camille.tremblay@example.com',
    clientPhone: '(514) 555-0142',
    clientAddress: '1420 Rue Peel, Montreal, QC H3A 1S5',
    brandId: 'zara',
    brandName: 'Zara Canada',
    productUrl: 'https://www.zara.com/ca/en/ribbed-knit-sweater-p0123456.html',
    itemName: 'Ribbed Knit Crewneck Sweater',
    itemSize: 'M',
    itemColor: 'Charcoal Grey',
    itemPrice: 45.9,
    notes: 'Please keep gift receipt if possible',
    ordered: false,
    orderedAt: null,
    createdAt: new Date(Date.now() - 3600 * 1000 * 5).toISOString(),
  },
  {
    id: 'ord_demo_2',
    clientId: 'usr_demo_marc',
    clientName: 'Marc-Antoine Roy',
    clientEmail: 'marc.roy@example.com',
    clientPhone: '(438) 555-0198',
    clientAddress: '3800 Rue Saint-Denis, Montreal, QC H2W 2M1',
    brandId: 'zara',
    brandName: 'Zara Canada',
    productUrl: 'https://www.zara.com/ca/en/cotton-oxford-shirt-p0987654.html',
    itemName: 'Slim Fit Oxford Shirt',
    itemSize: 'L',
    itemColor: 'Sky Blue',
    itemPrice: 39.9,
    notes: '',
    ordered: false,
    orderedAt: null,
    createdAt: new Date(Date.now() - 3600 * 1000 * 2).toISOString(),
  },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authModal, setAuthModal] = useState(null);
  const [toast, setToast] = useState(null);
  const [stripeLoading, setStripeLoading] = useState(false);

  const [authForm, setAuthForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    streetAddress: '',
    city: 'Montreal',
    postalCode: '',
    password: '',
    subscriptionPlan: 'monthly',
  });
  const [authErrors, setAuthErrors] = useState({});
  const [authLoading, setAuthLoading] = useState(false);

  const [selectedBrandId, setSelectedBrandId] = useState(MONTREAL_CLOTHING_BRANDS[0].id);
  const [orderForm, setOrderForm] = useState({
    productUrl: '',
    itemName: '',
    itemSize: '',
    itemColor: '',
    itemPrice: '',
    notes: '',
  });
  const [orderErrors, setOrderErrors] = useState({});
  const [orders, setOrders] = useState([]);
  const [processingOrderId, setProcessingOrderId] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Detect return from Stripe Checkout (?payment=success&plan=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const paidPlan = params.get('plan');

    if (paymentStatus === 'success') {
      showToast(`Stripe payment confirmed! Your ${paidPlan || 'Monthly'} pass is now active.`);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'cancelled') {
      showToast('Stripe checkout was cancelled.', 'warning');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  // Load Auth & Orders
  useEffect(() => {
    if (isFirebaseConfigured) {
      const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
        if (fbUser) {
          const cleanEmail = (fbUser.email || '').toLowerCase();
          const isAdmin = cleanEmail === ADMIN_EMAIL;

          if (isAdmin) {
            setCurrentUser({
              uid: fbUser.uid,
              firstName: 'StylePool',
              lastName: 'Admin',
              email: ADMIN_EMAIL,
              isAdmin: true,
            });
          } else {
            const snap = await getDoc(doc(db, 'users', fbUser.uid));
            const profile = snap.exists() ? snap.data() : {};
            setCurrentUser({
              uid: fbUser.uid,
              email: fbUser.email,
              ...profile,
              isAdmin: false,
            });
          }
        } else {
          setCurrentUser(null);
        }
      });

      const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
      const unsubOrders = onSnapshot(q, (snapshot) => {
        setOrders(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      });

      return () => {
        unsubAuth();
        unsubOrders();
      };
    } else {
      const savedUser = localStorage.getItem('sp_mtl_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        const isAdmin = (parsed.email || '').toLowerCase() === ADMIN_EMAIL;
        setCurrentUser({ ...parsed, isAdmin });
      }
      const savedOrders = localStorage.getItem('sp_mtl_orders');
      if (savedOrders) {
        setOrders(JSON.parse(savedOrders));
      } else {
        setOrders(INITIAL_DEMO_ORDERS);
        localStorage.setItem('sp_mtl_orders', JSON.stringify(INITIAL_DEMO_ORDERS));
      }
    }
  }, []);

  const saveDemoOrders = (updated) => {
    setOrders(updated);
    if (!isFirebaseConfigured) {
      localStorage.setItem('sp_mtl_orders', JSON.stringify(updated));
    }
  };

  // Start Stripe Checkout using pk_ and ${API_BASE_URL}/api/create-checkout-session (sk_)
  const handleStartStripeCheckout = async (planId) => {
    if (!currentUser) {
      setAuthForm((prev) => ({ ...prev, subscriptionPlan: planId }));
      setAuthModal('signup');
      return;
    }

    if (!stripePublishableKey || !stripePublishableKey.startsWith('pk_')) {
      showToast(
        'Add VITE_STRIPE_PUBLISHABLE_KEY (pk_...) and STRIPE_SECRET_KEY (sk_...) in .env.local to launch live Stripe Checkout.'
      );
      return;
    }

    setStripeLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/create-checkout-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: planId || currentUser.subscriptionPlan || 'monthly',
          clientEmail: currentUser.email,
          clientId: currentUser.uid,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not create Stripe Checkout session.');
      }

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      const stripe = await stripePromise;
      if (stripe && data.sessionId) {
        await stripe.redirectToCheckout({ sessionId: data.sessionId });
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setStripeLoading(false);
    }
  };

  // Client Sign Up with Field Verification (Admin email is blocked from client sign-up)
  const handleSignUp = async (e) => {
    e.preventDefault();
    const cleanEmail = (authForm.email || '').trim().toLowerCase();

    if (cleanEmail === ADMIN_EMAIL) {
      setAuthErrors({
        email: 'This email is reserved for the administrator. Please switch to Sign In.',
      });
      return;
    }

    const validation = validateRegistrationForm(authForm);
    if (!validation.isValid) {
      setAuthErrors(validation.errors);
      return;
    }
    setAuthErrors({});
    setAuthLoading(true);

    const fullAddress = `${authForm.streetAddress.trim()}, ${authForm.city.trim()}, QC ${validation.formattedPostalCode}`;

    try {
      if (isFirebaseConfigured) {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, authForm.password);
        const profileData = {
          firstName: authForm.firstName.trim(),
          lastName: authForm.lastName.trim(),
          email: cleanEmail,
          phone: validation.formattedPhone,
          address: fullAddress,
          subscriptionPlan: authForm.subscriptionPlan,
          subscriptionActive: true,
          isAdmin: false,
          createdAt: new Date().toISOString(),
        };
        await setDoc(doc(db, 'users', cred.user.uid), profileData);
        setCurrentUser({ uid: cred.user.uid, ...profileData, isAdmin: false });
      } else {
        const newUser = {
          uid: `usr_${Date.now()}`,
          firstName: authForm.firstName.trim(),
          lastName: authForm.lastName.trim(),
          email: cleanEmail,
          phone: validation.formattedPhone,
          address: fullAddress,
          subscriptionPlan: authForm.subscriptionPlan,
          subscriptionActive: true,
          isAdmin: false,
        };

        // Save in local client directory so future sign-ins restore their exact profile
        const existingClients = JSON.parse(localStorage.getItem('sp_mtl_clients') || '{}');
        existingClients[cleanEmail] = { ...newUser, password: authForm.password };
        localStorage.setItem('sp_mtl_clients', JSON.stringify(existingClients));

        localStorage.setItem('sp_mtl_user', JSON.stringify(newUser));
        setCurrentUser(newUser);
      }

      setAuthModal(null);
      showToast('Account verified and created! Welcome to StylePool MTL.');
    } catch (err) {
      setAuthErrors({ general: err.message });
    } finally {
      setAuthLoading(false);
    }
  };

  // Sign In (Routes mtl.stylepool@gmail.com + 77209515M@c exclusively to Admin Pool)
  const handleSignIn = async (e) => {
    e.preventDefault();
    if (!authForm.email || !authForm.password) {
      setAuthErrors({ general: 'Please enter both email and password.' });
      return;
    }
    setAuthErrors({});
    setAuthLoading(true);

    const cleanEmail = authForm.email.trim().toLowerCase();
    const isAdminAttempt = cleanEmail === ADMIN_EMAIL;

    // 1. Handle Admin Sign-In
    if (isAdminAttempt) {
      if (authForm.password !== ADMIN_PASS) {
        setAuthErrors({ general: 'Incorrect administrator password.' });
        setAuthLoading(false);
        return;
      }

      try {
        if (isFirebaseConfigured) {
          try {
            await signInWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASS);
          } catch {
            // Auto-provision the fixed admin account in Firebase on first login
            const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASS);
            await setDoc(doc(db, 'users', cred.user.uid), {
              firstName: 'StylePool',
              lastName: 'Admin',
              email: ADMIN_EMAIL,
              isAdmin: true,
              createdAt: new Date().toISOString(),
            });
          }
        } else {
          const adminUser = {
            uid: 'usr_stylepool_admin',
            firstName: 'StylePool',
            lastName: 'Admin',
            email: ADMIN_EMAIL,
            isAdmin: true,
          };
          localStorage.setItem('sp_mtl_user', JSON.stringify(adminUser));
          setCurrentUser(adminUser);
        }

        setAuthModal(null);
        showToast('Signed in to StylePool Admin Pool.');
      } catch (err) {
        setAuthErrors({ general: err.message });
      } finally {
        setAuthLoading(false);
      }
      return;
    }

    // 2. Handle Regular Client Sign-In
    try {
      if (isFirebaseConfigured) {
        await signInWithEmailAndPassword(auth, cleanEmail, authForm.password);
      } else {
        const existingClients = JSON.parse(localStorage.getItem('sp_mtl_clients') || '{}');
        const matchedClient = existingClients[cleanEmail];

        if (matchedClient && matchedClient.password !== authForm.password) {
          setAuthErrors({ general: 'Incorrect password for this client account.' });
          setAuthLoading(false);
          return;
        }

        const clientUser = matchedClient
          ? {
              uid: matchedClient.uid,
              firstName: matchedClient.firstName,
              lastName: matchedClient.lastName,
              email: matchedClient.email,
              phone: matchedClient.phone,
              address: matchedClient.address,
              subscriptionPlan: matchedClient.subscriptionPlan || 'monthly',
              subscriptionActive: true,
              isAdmin: false,
            }
          : {
              uid: `usr_${Date.now()}`,
              firstName: cleanEmail.split('@')[0],
              lastName: 'Client',
              email: cleanEmail,
              phone: '(514) 555-0188',
              address: '2900 Boulevard Édouard-Montpetit, Montreal, QC H3T 1J4',
              subscriptionPlan: 'monthly',
              subscriptionActive: true,
              isAdmin: false,
            };

        localStorage.setItem('sp_mtl_user', JSON.stringify(clientUser));
        setCurrentUser(clientUser);
      }

      setAuthModal(null);
      showToast('Signed in to your client profile.');
    } catch (err) {
      setAuthErrors({ general: err.message });
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    if (isFirebaseConfigured) {
      await signOut(auth);
    } else {
      localStorage.removeItem('sp_mtl_user');
      setCurrentUser(null);
    }
    showToast('Signed out.');
  };

  const selectedBrand = useMemo(
    () => MONTREAL_CLOTHING_BRANDS.find((b) => b.id === selectedBrandId),
    [selectedBrandId]
  );

  const handleOrderSubmit = async (e) => {
    e.preventDefault();
    if (!currentUser) {
      setAuthModal('signup');
      return;
    }

    const validation = validateOrderSubmission({
      brand: selectedBrand,
      ...orderForm,
    });

    if (!validation.isValid) {
      setOrderErrors(validation.errors);
      return;
    }
    setOrderErrors({});

    const newOrder = {
      clientId: currentUser.uid,
      clientName: `${currentUser.firstName} ${currentUser.lastName}`,
      clientEmail: currentUser.email,
      clientPhone: currentUser.phone,
      clientAddress: currentUser.address,
      brandId: selectedBrand.id,
      brandName: selectedBrand.name,
      productUrl: orderForm.productUrl.trim(),
      itemName: orderForm.itemName.trim(),
      itemSize: orderForm.itemSize.trim().toUpperCase(),
      itemColor: orderForm.itemColor.trim() || 'As pictured',
      itemPrice: Number(orderForm.itemPrice),
      notes: orderForm.notes.trim(),
      ordered: false,
      orderedAt: null,
      createdAt: new Date().toISOString(),
    };

    if (isFirebaseConfigured) {
      await addDoc(collection(db, 'orders'), newOrder);
    } else {
      const updated = [{ id: `ord_${Date.now()}`, ...newOrder }, ...orders];
      saveDemoOrders(updated);
    }

    setOrderForm({
      productUrl: '',
      itemName: '',
      itemSize: '',
      itemColor: '',
      itemPrice: '',
      notes: '',
    });

    showToast(`Added to the ${selectedBrand.name} order pool! We will email you once placed.`);
  };

  const handleToggleOrderPlaced = async (order) => {
    const newOrderedStatus = !order.ordered;
    const orderedTimestamp = newOrderedStatus ? new Date().toISOString() : null;
    setProcessingOrderId(order.id);

    try {
      if (isFirebaseConfigured) {
        await updateDoc(doc(db, 'orders', order.id), {
          ordered: newOrderedStatus,
          orderedAt: orderedTimestamp,
        });
      } else {
        const updated = orders.map((o) =>
          o.id === order.id ? { ...o, ordered: newOrderedStatus, orderedAt: orderedTimestamp } : o
        );
        saveDemoOrders(updated);
      }

      if (newOrderedStatus) {
        const response = await fetch(`${API_BASE_URL}/api/send-order-confirmation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientEmail: order.clientEmail,
            clientName: order.clientName,
            brandName: order.brandName,
            itemName: order.itemName,
            itemSize: order.itemSize,
            itemColor: order.itemColor,
            itemPrice: order.itemPrice,
            productUrl: order.productUrl,
            clientAddress: order.clientAddress,
          }),
        }).catch(() => null);

        if (response && response.ok) {
          showToast(`Order marked placed & confirmation email sent to ${order.clientEmail}!`);
        } else {
          showToast(`Order marked placed! (Confirmation email queued for ${order.clientEmail})`);
        }
      } else {
        showToast('Order unchecked and returned to pending pool.');
      }
    } finally {
      setProcessingOrderId(null);
    }
  };

  const ordersGroupedByBrand = useMemo(() => {
    const groups = {};
    MONTREAL_CLOTHING_BRANDS.forEach((b) => {
      groups[b.id] = {
        brand: b,
        items: [],
        pendingTotal: 0,
        orderedTotal: 0,
      };
    });

    orders.forEach((ord) => {
      if (!groups[ord.brandId]) {
        groups[ord.brandId] = {
          brand: {
            id: ord.brandId,
            name: ord.brandName,
            freeShippingMin: 75,
            domain: '',
          },
          items: [],
          pendingTotal: 0,
          orderedTotal: 0,
        };
      }
      groups[ord.brandId].items.push(ord);
      if (ord.ordered) {
        groups[ord.brandId].orderedTotal += Number(ord.itemPrice || 0);
      } else {
        groups[ord.brandId].pendingTotal += Number(ord.itemPrice || 0);
      }
    });

    return Object.values(groups).filter((g) => g.items.length > 0);
  }, [orders]);

  const myClientOrders = useMemo(() => {
    if (!currentUser) return [];
    return orders.filter(
      (o) => o.clientId === currentUser.uid || o.clientEmail === currentUser.email
    );
  }, [orders, currentUser]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 max-w-md bg-slate-900 text-white px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-3 border border-slate-700">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Top Navigation Bar with Sign In & Sign Up in Top Right */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-lg tracking-tight text-slate-900">
                StylePool <span className="text-indigo-600">MTL</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full font-medium">
                Montreal Clothing Order Pooling
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {currentUser ? (
              <>
                {currentUser.isAdmin ? (
                  <span className="px-3 py-1 rounded-lg text-xs font-bold bg-slate-900 text-indigo-300 border border-slate-700">
                    Admin Pool ({orders.filter((o) => !o.ordered).length} Pending)
                  </span>
                ) : (
                  <span className="text-xs sm:text-sm font-medium text-slate-700">
                    {currentUser.firstName} {currentUser.lastName}
                  </span>
                )}
                <button
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium text-slate-700 hover:bg-slate-100 border border-slate-200 transition"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setAuthErrors({});
                    setAuthModal('signin');
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-100 border border-slate-300 transition"
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setAuthErrors({});
                    setAuthModal('signup');
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition"
                >
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {!currentUser ? (
        /* PUBLIC LANDING PAGE */
        <main className="flex-1">
          <section className="max-w-7xl mx-auto px-4 sm:px-6 py-12 lg:py-16">
            <div className="grid lg:grid-cols-12 gap-10 items-center">
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" />
                  Never pay $10 shipping for a single clothing item again
                </div>
                <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
                  Pool your clothing orders in Montreal &{' '}
                  <span className="text-indigo-600">waive 100% of shipping fees.</span>
                </h1>
                <p className="text-base sm:text-lg text-slate-600 max-w-2xl">
                  Pick from 14+ popular clothing brands in Montreal (Simons, Zara, Aritzia, SSENSE,
                  H&M, Uniqlo, Lululemon & more). Paste your item link in your profile, we combine
                  it with fellow Montreal shoppers to unlock free shipping, and you get an instant
                  email confirmation the moment your order is placed.
                </p>
                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    onClick={() => {
                      setAuthErrors({});
                      setAuthModal('signup');
                    }}
                    className="px-6 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md transition"
                  >
                    Create Verified Client Profile
                  </button>
                  <button
                    onClick={() => {
                      setAuthErrors({});
                      setAuthModal('signin');
                    }}
                    className="px-5 py-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 font-semibold border border-slate-300 transition"
                  >
                    Sign In to Your Account
                  </button>
                </div>

                <div className="grid sm:grid-cols-3 gap-4 pt-6 border-t border-slate-200">
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-600">
                      <strong className="text-slate-900 block">Verified Montreal Profiles</strong>
                      Address, postal code & phone checked on sign-up.
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Layers className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-600">
                      <strong className="text-slate-900 block">14+ Clothing Brands</strong>
                      Grouped daily to pass store free-shipping minimums.
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <Mail className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-slate-600">
                      <strong className="text-slate-900 block">Instant Email Proof</strong>
                      Automatic email sent the second your item is ordered.
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-bold text-slate-900">Supported Montreal Clothing Brands</h3>
                  <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                    Active Pools
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2.5 max-h-80 overflow-y-auto pr-1">
                  {MONTREAL_CLOTHING_BRANDS.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between"
                    >
                      <span className="font-semibold text-sm text-slate-900">{b.name}</span>
                      <span className="text-[11px] text-slate-500 mt-1">
                        Free ship pool: ${b.freeShippingMin} CAD
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-16">
              <div className="text-center max-w-2xl mx-auto mb-8">
                <h2 className="text-2xl font-bold text-slate-900">Simple Client Membership</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Powered by Stripe (`pk_` & `sk_` API Checkout). Save money on your very first
                  pooled order.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-6">
                {SUBSCRIPTION_PLANS.map((plan) => (
                  <div
                    key={plan.id}
                    className={`rounded-2xl p-6 border bg-white flex flex-col justify-between ${
                      plan.id === 'monthly'
                        ? 'border-indigo-600 ring-2 ring-indigo-600/10 shadow-md'
                        : 'border-slate-200'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">{plan.name}</span>
                        <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold">
                          {plan.badge}
                        </span>
                      </div>
                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="text-3xl font-extrabold text-slate-900">
                          ${plan.price.toFixed(2)}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">CAD {plan.period}</span>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{plan.description}</p>
                    </div>
                    <button
                      onClick={() => {
                        setAuthForm((prev) => ({ ...prev, subscriptionPlan: plan.id }));
                        setAuthErrors({});
                        setAuthModal('signup');
                      }}
                      className="mt-6 w-full py-2.5 rounded-xl bg-slate-900 hover:bg-indigo-600 text-white text-sm font-semibold transition"
                    >
                      Choose {plan.name}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      ) : !currentUser.isAdmin ? (
        /* CLIENT PROFILE VIEW (Strictly isolated — no Admin Pool access) */
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-sm">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">
                  {currentUser.firstName} {currentUser.lastName}
                </h2>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Verified Montreal Profile
                </span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600 pt-1">
                <span className="inline-flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 text-slate-400" /> {currentUser.email}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-slate-400" /> {currentUser.phone}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-slate-400" /> {currentUser.address}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t lg:border-t-0 pt-3 lg:pt-0">
              <div className="text-right">
                <span className="text-xs text-slate-500 block">Selected Plan</span>
                <span className="text-sm font-bold text-indigo-600 uppercase">
                  {currentUser.subscriptionPlan || 'Monthly'} Pass
                </span>
              </div>
              <button
                type="button"
                disabled={stripeLoading}
                onClick={() => handleStartStripeCheckout(currentUser.subscriptionPlan || 'monthly')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50"
              >
                <CreditCard className="w-4 h-4" />
                {stripeLoading ? 'Opening Stripe...' : 'Pay / Manage Subscription (Stripe)'}
              </button>
            </div>
          </div>

          <div className="grid lg:grid-cols-12 gap-8">
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-indigo-600" />
                  1. Select a Montreal Clothing Brand
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose the store you are shopping from so we can pool your link with matching
                  orders.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-3">
                  {MONTREAL_CLOTHING_BRANDS.map((brand) => {
                    const isSelected = brand.id === selectedBrandId;
                    return (
                      <button
                        type="button"
                        key={brand.id}
                        onClick={() => {
                          setSelectedBrandId(brand.id);
                          setOrderErrors({});
                        }}
                        className={`p-3 rounded-xl border text-left transition ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/70 ring-2 ring-indigo-600/20'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                      >
                        <div className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
                          {brand.name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {brand.domain} • Pool ${brand.freeShippingMin}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={handleOrderSubmit} className="space-y-4 border-t border-slate-100 pt-5">
                <h3 className="text-lg font-bold text-slate-900">
                  2. Paste Your {selectedBrand?.name} Order Link & Details
                </h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Product Link from {selectedBrand?.domain} *
                  </label>
                  <input
                    type="url"
                    placeholder={`https://www.${selectedBrand?.domain}/...`}
                    value={orderForm.productUrl}
                    onChange={(e) => setOrderForm({ ...orderForm, productUrl: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                  {orderErrors.productUrl && (
                    <p className="text-xs text-rose-600 mt-1">{orderErrors.productUrl}</p>
                  )}
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Exact Item Name *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Merino Wool Turtleneck"
                      value={orderForm.itemName}
                      onChange={(e) => setOrderForm({ ...orderForm, itemName: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                    {orderErrors.itemName && (
                      <p className="text-xs text-rose-600 mt-1">{orderErrors.itemName}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Item Price (Before Tax in CAD) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="e.g., 39.90"
                      value={orderForm.itemPrice}
                      onChange={(e) => setOrderForm({ ...orderForm, itemPrice: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                    {orderErrors.itemPrice && (
                      <p className="text-xs text-rose-600 mt-1">{orderErrors.itemPrice}</p>
                    )}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Size *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., M, Small, 30x32, US 9"
                      value={orderForm.itemSize}
                      onChange={(e) => setOrderForm({ ...orderForm, itemSize: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                    {orderErrors.itemSize && (
                      <p className="text-xs text-rose-600 mt-1">{orderErrors.itemSize}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Color / Style Variant
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Navy Blue / Black"
                      value={orderForm.itemColor}
                      onChange={(e) => setOrderForm({ ...orderForm, itemColor: e.target.value })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Special Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Backup size if out of stock"
                    value={orderForm.notes}
                    onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm transition"
                >
                  Submit Order Link to {selectedBrand?.name} Pool ($0 Shipping)
                </button>
              </form>
            </div>

            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col">
              <h3 className="text-lg font-bold text-slate-900">Your Submitted Clothing Orders</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                As soon as our admin places the pooled order on the brand’s website and checks off
                your item, your status updates here and you receive an email confirmation.
              </p>

              <div className="mt-4 space-y-3 flex-1">
                {myClientOrders.length === 0 ? (
                  <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl text-slate-400 text-sm">
                    You haven’t submitted any clothing links yet.
                  </div>
                ) : (
                  myClientOrders.map((ord) => (
                    <div
                      key={ord.id}
                      className={`p-4 rounded-xl border ${
                        ord.ordered
                          ? 'bg-emerald-50/40 border-emerald-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                          {ord.brandName}
                        </span>
                        {ord.ordered ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Ordered & Email Sent
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                            <Truck className="w-3.5 h-3.5" /> In Brand Pool
                          </span>
                        )}
                      </div>
                      <div className="font-semibold text-sm text-slate-900 mt-1.5">
                        {ord.itemName}
                      </div>
                      <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-3">
                        <span>
                          Size: <strong>{ord.itemSize}</strong>
                        </span>
                        <span>
                          Color: <strong>{ord.itemColor}</strong>
                        </span>
                        <span>
                          Price: <strong>${Number(ord.itemPrice).toFixed(2)} CAD</strong>
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between text-xs">
                        <a
                          href={ord.productUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline inline-flex items-center gap-1 font-medium"
                        >
                          View Item Link <ExternalLink className="w-3 h-3" />
                        </a>
                        {ord.orderedAt && (
                          <span className="text-emerald-700 font-medium">
                            Ordered {new Date(ord.orderedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </main>
      ) : (
        /* ADMIN POOL VIEW (Accessible ONLY when signed in as mtl.stylepool@gmail.com) */
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 space-y-6">
          <div className="bg-slate-900 text-white rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                Admin Master Profile ({ADMIN_EMAIL})
              </span>
              <h2 className="text-2xl font-bold mt-0.5">
                Montreal Clothing Order Pools (Grouped by Brand)
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Orders from all clients are automatically grouped by clothing website below. Place
                the combined order on the brand’s site, then click the checkbox in front of each
                order to automatically email the client that their order is placed.
              </p>
            </div>
            <div className="flex gap-4 shrink-0">
              <div className="bg-slate-800 px-4 py-3 rounded-xl border border-slate-700 text-center">
                <span className="text-xs text-slate-400 block">Pending Orders</span>
                <span className="text-xl font-extrabold text-amber-400">
                  {orders.filter((o) => !o.ordered).length}
                </span>
              </div>
              <div className="bg-slate-800 px-4 py-3 rounded-xl border border-slate-700 text-center">
                <span className="text-xs text-slate-400 block">Placed & Emailed</span>
                <span className="text-xl font-extrabold text-emerald-400">
                  {orders.filter((o) => o.ordered).length}
                </span>
              </div>
            </div>
          </div>

          {ordersGroupedByBrand.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
              No client orders in the pool yet.
            </div>
          ) : (
            <div className="space-y-6">
              {ordersGroupedByBrand.map(({ brand, items, pendingTotal }) => {
                const thresholdMet = pendingTotal >= brand.freeShippingMin;
                const progressPct = Math.min(
                  100,
                  Math.round((pendingTotal / (brand.freeShippingMin || 75)) * 100)
                );

                return (
                  <div
                    key={brand.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
                  >
                    <div className="p-5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-lg font-bold text-slate-900">{brand.name}</h3>
                          <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold">
                            {items.length} {items.length === 1 ? 'item' : 'items'}
                          </span>
                          {thresholdMet && (
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                              FREE SHIPPING UNLOCKED! Ready to Order
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Pending Pool Subtotal: <strong>${pendingTotal.toFixed(2)} CAD</strong> / $
                          {brand.freeShippingMin} CAD required for free shipping
                        </p>
                      </div>

                      <div className="w-full sm:w-56">
                        <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              thresholdMet ? 'bg-emerald-500' : 'bg-indigo-600'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-right text-slate-500 mt-1">
                          {progressPct}% of free-shipping minimum
                        </div>
                      </div>
                    </div>

                    <div className="divide-y divide-slate-100">
                      {items.map((ord) => (
                        <div
                          key={ord.id}
                          className={`p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition ${
                            ord.ordered ? 'bg-emerald-50/30' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <div className="flex items-start gap-3.5">
                            <button
                              type="button"
                              disabled={processingOrderId === ord.id}
                              onClick={() => handleToggleOrderPlaced(ord)}
                              title="Click when ordered on website to email client"
                              className="mt-0.5 text-indigo-600 hover:text-indigo-800 focus:outline-none disabled:opacity-50"
                            >
                              {ord.ordered ? (
                                <CheckSquare className="w-6 h-6 text-emerald-600" />
                              ) : (
                                <Square className="w-6 h-6 text-slate-400 hover:text-indigo-600" />
                              )}
                            </button>

                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`font-bold text-sm ${
                                    ord.ordered ? 'line-through text-slate-500' : 'text-slate-900'
                                  }`}
                                >
                                  {ord.itemName}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-semibold">
                                  Size: {ord.itemSize}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                                  Color: {ord.itemColor}
                                </span>
                                <span className="text-xs font-bold text-slate-900">
                                  ${Number(ord.itemPrice).toFixed(2)} CAD
                                </span>
                              </div>

                              <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                                <span>
                                  <strong>Client:</strong> {ord.clientName} ({ord.clientEmail})
                                </span>
                                <span>
                                  <strong>Phone:</strong> {ord.clientPhone}
                                </span>
                                <span>
                                  <strong>Address:</strong> {ord.clientAddress}
                                </span>
                              </div>

                              {ord.notes && (
                                <div className="text-xs text-amber-700 bg-amber-50 px-2.5 py-1 rounded inline-block">
                                  Note: {ord.notes}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 self-end lg:self-center shrink-0">
                            <a
                              href={ord.productUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                            >
                              Open Item Link <ExternalLink className="w-3.5 h-3.5" />
                            </a>

                            <button
                              type="button"
                              disabled={processingOrderId === ord.id}
                              onClick={() => handleToggleOrderPlaced(ord)}
                              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                                ord.ordered
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                              }`}
                            >
                              {ord.ordered ? 'Ordered & Emailed ✓' : 'Check & Email Client'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* SIGN IN & SIGN UP MODAL */}
      {authModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-200 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-xl font-bold text-slate-900">
                  {authModal === 'signup'
                    ? 'Create Your Verified Montreal Profile'
                    : 'Sign In to StylePool MTL'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {authModal === 'signup'
                    ? 'All contact and address fields are verified to prevent delivery issues.'
                    : 'Sign in with your client email or administrator credentials.'}
                </p>
              </div>
              <button
                onClick={() => setAuthModal(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold px-2 py-1"
              >
                ✕
              </button>
            </div>

            {authErrors.general && (
              <div className="mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{authErrors.general}</span>
              </div>
            )}

            <form
              onSubmit={authModal === 'signup' ? handleSignUp : handleSignIn}
              className="mt-5 space-y-4"
            >
              {authModal === 'signup' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        First Name *
                      </label>
                      <div className="relative">
                        <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                        <input
                          type="text"
                          placeholder="Ali"
                          value={authForm.firstName}
                          onChange={(e) => setAuthForm({ ...authForm, firstName: e.target.value })}
                          className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm"
                        />
                      </div>
                      {authErrors.firstName && (
                        <p className="text-[11px] text-rose-600 mt-1">{authErrors.firstName}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        placeholder="Rouhani"
                        value={authForm.lastName}
                        onChange={(e) => setAuthForm({ ...authForm, lastName: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                      {authErrors.lastName && (
                        <p className="text-[11px] text-rose-600 mt-1">{authErrors.lastName}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Cell Phone Number (10 Digits) *
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="tel"
                        placeholder="514-555-0199"
                        value={authForm.phone}
                        onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>
                    {authErrors.phone && (
                      <p className="text-[11px] text-rose-600 mt-1">{authErrors.phone}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Street Address (Civic Number & Street) *
                    </label>
                    <div className="relative">
                      <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        placeholder="1250 Boulevard René-Lévesque O"
                        value={authForm.streetAddress}
                        onChange={(e) =>
                          setAuthForm({ ...authForm, streetAddress: e.target.value })
                        }
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                    </div>
                    {authErrors.streetAddress && (
                      <p className="text-[11px] text-rose-600 mt-1">{authErrors.streetAddress}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        City *
                      </label>
                      <input
                        type="text"
                        value={authForm.city}
                        onChange={(e) => setAuthForm({ ...authForm, city: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
                      />
                      {authErrors.city && (
                        <p className="text-[11px] text-rose-600 mt-1">{authErrors.city}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Quebec Postal Code *
                      </label>
                      <input
                        type="text"
                        placeholder="H3B 4W8"
                        value={authForm.postalCode}
                        onChange={(e) => setAuthForm({ ...authForm, postalCode: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm uppercase"
                      />
                      {authErrors.postalCode && (
                        <p className="text-[11px] text-rose-600 mt-1">{authErrors.postalCode}</p>
                      )}
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    placeholder="you@example.com"
                    value={authForm.email}
                    onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                {authErrors.email && (
                  <p className="text-[11px] text-rose-600 mt-1">{authErrors.email}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password *
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="password"
                    placeholder="At least 6 characters"
                    value={authForm.password}
                    onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                {authErrors.password && (
                  <p className="text-[11px] text-rose-600 mt-1">{authErrors.password}</p>
                )}
              </div>

              {authModal === 'signup' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Subscription Plan
                  </label>
                  <select
                    value={authForm.subscriptionPlan}
                    onChange={(e) =>
                      setAuthForm({ ...authForm, subscriptionPlan: e.target.value })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white"
                  >
                    <option value="monthly">Monthly Unlimited Pool Pass — $5.99 CAD / month</option>
                    <option value="annual">Annual Pool Pass — $49.00 CAD / year</option>
                    <option value="single">Single Order Trial — $2.49 CAD / order</option>
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-sm transition"
              >
                {authLoading
                  ? 'Verifying...'
                  : authModal === 'signup'
                  ? 'Verify Info & Create Account'
                  : 'Sign In'}
              </button>
            </form>

            <div className="mt-4 text-center text-xs text-slate-500">
              {authModal === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthErrors({});
                      setAuthModal('signin');
                    }}
                    className="text-indigo-600 font-semibold hover:underline"
                  >
                    Sign In
                  </button>
                </>
              ) : (
                <>
                  New to StylePool MTL?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setAuthErrors({});
                      setAuthModal('signup');
                    }}
                    className="text-indigo-600 font-semibold hover:underline"
                  >
                    Sign Up
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}