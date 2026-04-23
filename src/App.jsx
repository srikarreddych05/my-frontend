import React, { useState, useEffect, useMemo } from 'react';
import { 
  Car, Map as MapIcon, Wallet, AlertTriangle, Shield, Clock, 
  Search, CheckCircle2, Activity, UserCircle, Menu, X, 
  ChevronRight, BarChart3, Navigation, Download, CreditCard,
  WifiOff, AlertOctagon, RotateCcw, Monitor, Settings, Zap
} from 'lucide-react';

// --- CONFIGURATION ---
const API_BASE = "https://smart-parking-backend-1cvq.onrender.com/api";
const WS_BASE = "ws://smart-parking-backend-1cvq.onrender.com/ws/parking";

// --- UI COMPONENTS ---
const Card = ({ children, className = '' }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm ${className}`}>
    {children}
  </div>
);

const Badge = ({ children, variant = 'default' }) => {
  const variants = {
    default: 'bg-slate-100 text-slate-700',
    free: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    occupied: 'bg-blue-50 text-blue-700 border border-blue-200',
    maintenance: 'bg-amber-50 text-amber-700 border border-amber-200',
    danger: 'bg-rose-50 text-rose-700 border border-rose-200',
    success: 'bg-emerald-100 text-emerald-700 border border-emerald-300',
  };
  return (
    <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${variants[variant] || variants.default}`}>
      {children}
    </span>
  );
};

// --- SHARED MAP COMPONENT ---
const ParkingGrid = ({ spots, onSpotClick, interactive = false, highlightPlate = '', selectedSpotId = null }) => {
  const getStatusColor = (status, isOverstay) => {
    if (isOverstay) return 'bg-rose-500 border-rose-600 text-white shadow-rose-200 shadow-md animate-pulse';
    switch (status) {
      case 'free': return 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100';
      case 'occupied': return 'bg-slate-800 border-slate-900 text-slate-100';
      case 'maintenance': return 'bg-amber-100 border-amber-300 text-amber-800 diagonal-stripes';
      default: return 'bg-slate-100 border-slate-200';
    }
  };

  return (
    <div className="grid grid-cols-5 md:grid-cols-10 gap-3">
      {spots.map((spot) => {
        const isHighlighted = highlightPlate && spot.plate && spot.plate.toLowerCase().includes(highlightPlate.toLowerCase());
        return (
          <button
            key={spot.id}
            onClick={() => interactive && onSpotClick && onSpotClick(spot)}
            disabled={!interactive}
            className={`
              relative aspect-square rounded-xl border-2 flex flex-col items-center justify-center transition-all
              ${getStatusColor(spot.status, spot.isOverstay)}
              ${isHighlighted ? 'ring-4 ring-indigo-500 scale-110 z-10' : ''}
              ${spot.id === selectedSpotId ? 'ring-4 ring-indigo-500 scale-110 z-20' : ''}
              ${interactive && spot.status === 'free' ? 'hover:ring-2 hover:ring-indigo-300' : ''}
              ${interactive ? 'cursor-pointer hover:scale-105' : 'cursor-default'}
            `}
          >
            <span className="text-sm font-bold">{spot.id}</span>
            {spot.status === 'occupied' && <Car className="w-5 h-5 mt-1 opacity-80" />}
            {spot.status === 'maintenance' && <AlertTriangle className="w-5 h-5 mt-1 opacity-80" />}
            {spot.isOverstay && <AlertOctagon className="absolute -top-2 -right-2 w-5 h-5 text-rose-500 bg-white rounded-full" />}
          </button>
        );
      })}
      <style dangerouslySetInnerHTML={{__html: `
        .diagonal-stripes {
          background-image: repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(251, 191, 36, 0.2) 10px, rgba(251, 191, 36, 0.2) 20px);
        }
      `}} />
    </div>
  );
};

// --- VIEWS ---

// 1. Driver View
const DriverDashboard = ({ spots, emergencyMode, currentUser, setCurrentUser }) => {
  const [showMyCar, setShowMyCar] = useState(false);
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedSpotForBooking, setSelectedSpotForBooking] = useState(null);
  
  const [bookingStartTime, setBookingStartTime] = useState('');
  const [bookingEndTime, setBookingEndTime] = useState('');
  
  const myBooking = currentUser?.activeBooking;

  // Real Backend Booking Logic
  const handleConfirmBooking = async () => {
    if (!selectedSpotForBooking || !bookingStartTime || !bookingEndTime) return;

    try {
      const response = await fetch(`${API_BASE}/bookings/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          spot_id: selectedSpotForBooking.id, 
          user_id: currentUser.id,
          start_time: bookingStartTime,
          end_time: bookingEndTime,
          plate: currentUser.plate
        })
      });
      
      if (!response.ok) throw new Error("Spot already taken or server error");
      
      const data = await response.json();

      // Update Local user context. The Spot state will be updated via WebSocket!
      setCurrentUser({
        ...currentUser,
        activeBooking: data.booking || {
          id: selectedSpotForBooking.id,
          date: new Date().toLocaleDateString(),
          startTime: bookingStartTime,
          endTime: bookingEndTime,
          plate: currentUser.plate,
          price: '$4.50/hr',
          status: 'Active'
        }
      });
      
      setIsBookingOpen(false);
      setSelectedSpotForBooking(null);
      setBookingStartTime('');
      setBookingEndTime('');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleEndBooking = async () => {
    if (!myBooking) return;

    try {
      const response = await fetch(`${API_BASE}/bookings/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spot_id: myBooking.id, user_id: currentUser.id })
      });

      if (!response.ok) throw new Error("Could not end booking.");
      
      // Clear active booking locally. Spot frees via WebSocket.
      const endTimeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const completedBooking = { ...myBooking, endTime: endTimeStr, status: 'Completed' };
      
      setCurrentUser({ 
        ...currentUser, 
        activeBooking: null, 
        bookingHistory: [completedBooking, ...(currentUser.bookingHistory || [])] 
      });
    } catch (err) {
      alert(err.message);
    }
  };
  
  if (emergencyMode) {
    return (
      <div className="animate-in fade-in zoom-in duration-300 flex flex-col items-center justify-center h-full bg-rose-600 rounded-3xl p-8 text-white text-center shadow-2xl shadow-rose-900/50">
        <AlertTriangle className="w-24 h-24 mb-6 animate-pulse" />
        <h1 className="text-4xl font-bold mb-4 tracking-tight">EMERGENCY EVACUATION</h1>
        <p className="text-xl mb-8 opacity-90">Please return to your vehicle immediately and follow the lit exit routes. Do not use elevators.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Search & Status Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="col-span-2 p-6 bg-slate-900 text-white overflow-hidden relative">
          <div className="relative z-10">
            {myBooking ? (
              <>
                <h2 className="text-2xl font-semibold mb-2">Active Booking: {myBooking.id}</h2>
                <div className="flex items-center gap-6 mt-4">
                  <div>
                    <p className="text-slate-400 text-sm">Vehicle Plate</p>
                    <p className="text-lg font-medium">{myBooking.plate}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-sm">Session Time</p>
                    <p className="text-lg font-medium text-emerald-400">{myBooking.startTime} - {myBooking.endTime || 'Ongoing'}</p>
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button onClick={handleEndBooking} className="bg-rose-500 text-white border border-rose-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-600 flex items-center gap-2 transition-colors">
                    End Session
                  </button>
                </div>
              </>
            ) : (
              <div className="py-4">
                <h2 className="text-2xl font-semibold mb-2">Book Your Spot</h2>
                <p className="text-slate-400 text-sm mb-6 max-w-sm">
                  {currentUser?.plate 
                    ? "Ready to park? Browse the live map and reserve an available spot instantly." 
                    : "Please add your license plate in Account Settings to start booking spots."}
                </p>
                {currentUser?.plate ? (
                  <button onClick={() => setIsBookingOpen(true)} className="bg-white text-slate-900 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-100 transition-colors flex items-center gap-2">
                    <MapIcon className="w-4 h-4" /> Book Now
                  </button>
                ) : (
                  <span className="inline-block bg-slate-800 text-slate-300 px-4 py-2 rounded-lg text-sm font-medium">Action Required</span>
                )}
              </div>
            )}
          </div>
          <Car className="absolute -right-6 -bottom-6 w-48 h-48 text-white/5" />
        </Card>

        <Card className="p-6 flex flex-col justify-center">
          <div className="flex justify-between items-start mb-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Wallet className="w-6 h-6" />
            </div>
            <Badge variant="success">Auto-Pay On</Badge>
          </div>
          <p className="text-slate-500 text-sm font-medium mb-1">Wallet Balance</p>
          <h3 className="text-3xl font-bold text-slate-900 mb-4">${currentUser?.balance?.toFixed(2) || '0.00'}</h3>
        </Card>
      </div>

      {/* Find My Car & Live Map */}
      <Card className="p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Live Interactive Map</h3>
            <p className="text-sm text-slate-500">Real-time availability across all zones.</p>
          </div>
          <div className="flex items-center">
            <button 
              onClick={() => setShowMyCar(!showMyCar)}
              disabled={!myBooking}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                showMyCar 
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' 
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed'
              }`}
            >
              <Car className="w-4 h-4" />
              {showMyCar ? 'Clear Highlight' : 'Find My Car'}
            </button>
          </div>
        </div>
        
        {/* Legend */}
        <div className="flex gap-4 mb-6 flex-wrap">
          <div className="flex items-center gap-2 text-sm"><span className="w-3 h-3 rounded-full bg-emerald-100 border border-emerald-300"></span> Available</div>
          <div className="flex items-center gap-2 text-sm"><span className="w-3 h-3 rounded-full bg-slate-800"></span> Occupied</div>
          <div className="flex items-center gap-2 text-sm"><span className="w-3 h-3 rounded-full bg-amber-200 diagonal-stripes"></span> Maintenance</div>
        </div>

        <div className="p-6 bg-slate-50 rounded-xl border border-slate-100 overflow-x-auto">
          <ParkingGrid spots={spots} highlightPlate={showMyCar && currentUser?.plate ? currentUser.plate : ''} />
        </div>
      </Card>

      {/* Booking Modal */}
      {isBookingOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-4xl p-6 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Select an Available Spot</h2>
                <p className="text-sm text-slate-500">Click on any green spot to reserve it.</p>
              </div>
              <button onClick={() => { setIsBookingOpen(false); setSelectedSpotForBooking(null); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="w-5 h-5"/>
              </button>
            </div>
            
            <div className="flex-1 overflow-auto bg-slate-50 rounded-xl border border-slate-200 p-4 mb-6">
               <ParkingGrid 
                 spots={spots} 
                 interactive={true} 
                 selectedSpotId={selectedSpotForBooking?.id}
                 onSpotClick={(spot) => { if (spot.status === 'free') setSelectedSpotForBooking(spot) }} 
               />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-1.5">Start Time</label>
                 <div className="relative">
                   <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                   <input 
                     type="time" 
                     value={bookingStartTime}
                     onChange={(e) => setBookingStartTime(e.target.value)}
                     className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                     required 
                   />
                 </div>
               </div>
               <div>
                 <label className="block text-sm font-medium text-slate-700 mb-1.5">End Time</label>
                 <div className="relative">
                   <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                   <input 
                     type="time" 
                     value={bookingEndTime}
                     onChange={(e) => setBookingEndTime(e.target.value)}
                     className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                     required 
                   />
                 </div>
               </div>
            </div>

            <div className="flex justify-between items-center border-t border-slate-100 pt-4">
               <div>
                 {selectedSpotForBooking ? (
                   <p className="text-slate-700 font-medium">Selected Spot: <span className="text-indigo-600 font-bold text-lg">{selectedSpotForBooking.id}</span></p>
                 ) : (
                   <p className="text-slate-500 italic">No spot selected</p>
                 )}
               </div>
               <div className="flex gap-3">
                 <button onClick={() => { setIsBookingOpen(false); setBookingStartTime(''); setBookingEndTime(''); }} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">Cancel</button>
                 <button 
                   onClick={handleConfirmBooking} 
                   disabled={!selectedSpotForBooking || !bookingStartTime || !bookingEndTime}
                   className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors"
                 >
                   Confirm Booking
                 </button>
               </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

// 1.4 Booking History Component
const BookingHistory = ({ currentUser }) => {
  const history = currentUser?.bookingHistory || [];
  
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Booking History</h2>
        <p className="text-slate-500 text-sm mt-1">Review your past parking sessions and receipts.</p>
      </div>
      
      <Card className="overflow-hidden">
        {history.length === 0 ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-500">
            <CheckCircle2 className="w-12 h-12 text-slate-300 mb-4" />
            <p>No booking history available yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="p-4 text-sm font-medium text-slate-500 whitespace-nowrap">Spot</th>
                  <th className="p-4 text-sm font-medium text-slate-500 whitespace-nowrap">Date</th>
                  <th className="p-4 text-sm font-medium text-slate-500 whitespace-nowrap">Time</th>
                  <th className="p-4 text-sm font-medium text-slate-500 whitespace-nowrap">Vehicle</th>
                  <th className="p-4 text-sm font-medium text-slate-500 whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {history.map((booking, idx) => (
                  <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-bold text-slate-900 whitespace-nowrap">{booking.id}</td>
                    <td className="p-4 text-slate-600 whitespace-nowrap">{booking.date}</td>
                    <td className="p-4 text-slate-600 whitespace-nowrap">{booking.startTime} {booking.endTime ? `- ${booking.endTime}` : '(Ongoing)'}</td>
                    <td className="p-4 text-slate-600 whitespace-nowrap">{booking.plate}</td>
                    <td className="p-4 whitespace-nowrap">
                      {booking.endTime ? <Badge variant="default">Completed</Badge> : <Badge variant="success">Active</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

// 1.5 Driver Settings View
const DriverSettings = ({ currentUser, setCurrentUser }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(currentUser || { name: '', email: '', plate: '' });

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_BASE}/users/${currentUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        setCurrentUser({ ...currentUser, ...formData });
        setIsEditing(false);
      }
    } catch (err) {
      alert("Failed to update profile via API.");
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Account Settings</h2>
        </div>
        {!isEditing && (
          <button onClick={() => setIsEditing(true)} className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors">
            Edit Profile
          </button>
        )}
      </div>

      <Card className="p-6">
        <form onSubmit={handleSave} className="space-y-6">
          <div className="flex items-center gap-6 pb-6 border-b border-slate-100">
            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center text-2xl font-bold border-2 border-indigo-100 uppercase">
              {formData.name ? formData.name.charAt(0) : <UserCircle className="w-10 h-10" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{formData.name || 'User Profile'}</h3>
              <p className="text-slate-500 text-sm">{formData.email}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
              <input 
                type="text" 
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                disabled={!isEditing}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none disabled:opacity-60 transition-all" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
              <input 
                type="email" 
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                disabled={!isEditing}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none disabled:opacity-60 transition-all" 
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Primary License Plate</label>
              <div className="relative">
                <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  value={formData.plate}
                  onChange={(e) => setFormData({...formData, plate: e.target.value.toUpperCase()})}
                  disabled={!isEditing}
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm uppercase focus:outline-none disabled:opacity-60 transition-all" 
                />
              </div>
            </div>
          </div>

          {isEditing && (
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button type="button" onClick={() => { setFormData(currentUser); setIsEditing(false); }} className="px-4 py-2 text-slate-600 bg-slate-100 hover:bg-slate-200 text-sm font-medium rounded-lg transition-colors">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200">
                Save Changes
              </button>
            </div>
          )}
        </form>
      </Card>
    </div>
  );
};

// 2. Admin Command Center
const AdminDashboard = ({ spots, role, startEvacuation, cancelEvacuation, evacuationCountdown, globalBookings }) => {
  const [offlineSync, setOfflineSync] = useState(false);
  const [dynamicPricing, setDynamicPricing] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState(null);

  const stats = useMemo(() => {
    const total = spots.length;
    const occupied = spots.filter(s => s.status === 'occupied').length;
    const maintenance = spots.filter(s => s.status === 'maintenance').length;
    const ghostSpots = spots.filter(s => s.isOverstay).length;
    const occupancyRate = total > 0 ? Math.round((occupied/total)*100) : 0;
    return { total, occupied, maintenance, ghostSpots, occupancyRate };
  }, [spots]);

  const updateSpotStatusAPI = async (newStatus) => {
    try {
      // Backend integration for manual spot override
      const response = await fetch(`${API_BASE}/admin/spots/${selectedSpot.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (response.ok) {
        setSelectedSpot(null);
        // Note: WebSocket handles broadcasting this update to all clients!
      }
    } catch (err) {
      console.error("Failed to update spot", err);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Top Admin Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
            <Shield className="w-4 h-4 text-slate-600" />
            <span className="text-sm font-medium text-slate-700">Role: {role === 'admin_super' ? 'Super Admin' : 'Staff'}</span>
          </div>
          <button 
            onClick={() => setOfflineSync(!offlineSync)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${offlineSync ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}
          >
            {offlineSync ? <WifiOff className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
            {offlineSync ? 'Offline Mode (IndexedDB)' : 'System Online'}
          </button>
        </div>
        
        <div className="flex items-center gap-3">
          {evacuationCountdown !== null ? (
            <button 
              onClick={cancelEvacuation}
              className="relative overflow-hidden flex items-center gap-2 px-6 py-2 bg-amber-400 hover:bg-amber-500 text-slate-900 rounded-lg text-sm font-bold shadow-md shadow-amber-400/20 transition-all"
            >
              <div 
                className="absolute inset-y-0 left-0 bg-amber-500/30 transition-all duration-1000 ease-linear" 
                style={{ width: `${(evacuationCountdown / 10) * 100}%` }}
              />
              <span className="relative z-10 flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                UNDO EVACUATION ({evacuationCountdown}s)
              </span>
            </button>
          ) : (
            <button 
              onClick={startEvacuation}
              className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium shadow-sm transition-colors"
            >
              <AlertTriangle className="w-4 h-4" />
              Mass Evacuation
            </button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="p-5">
          <p className="text-sm text-slate-500 font-medium mb-1">Occupancy Rate</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold text-slate-900">{stats.occupancyRate}%</h3>
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500 font-medium mb-1">Available Spots</p>
          <h3 className="text-3xl font-bold text-slate-900">{stats.total - stats.occupied - stats.maintenance}</h3>
        </Card>
        <Card className={`p-5 ${stats.ghostSpots > 0 ? 'bg-rose-50 border-rose-100' : ''}`}>
          <div className="flex justify-between items-start">
            <div>
              <p className={`text-sm font-medium mb-1 ${stats.ghostSpots > 0 ? 'text-rose-600' : 'text-slate-500'}`}>Ghost Spots (Overstay)</p>
              <h3 className={`text-3xl font-bold ${stats.ghostSpots > 0 ? 'text-rose-700' : 'text-slate-900'}`}>{stats.ghostSpots}</h3>
            </div>
            {stats.ghostSpots > 0 && <AlertOctagon className="w-6 h-6 text-rose-500" />}
          </div>
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500 font-medium mb-1">Est. Revenue (Day)</p>
          <h3 className="text-3xl font-bold text-slate-900">$4,250</h3>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Master Control Grid */}
        <Card className="col-span-2 p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Master Control Grid</h3>
              <p className="text-sm text-slate-500">Click a spot to manually override status.</p>
            </div>
          </div>
          
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
             <ParkingGrid spots={spots} interactive={true} onSpotClick={(spot) => setSelectedSpot(spot)} />
          </div>

          {/* Inline Edit Modal/Drawer */}
          {selectedSpot && (
            <div className="mt-4 p-4 border-2 border-indigo-100 bg-indigo-50/50 rounded-xl flex items-center justify-between animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white rounded-lg shadow-sm flex items-center justify-center text-lg font-bold text-indigo-900">
                  {selectedSpot.id}
                </div>
                <div>
                  <p className="font-semibold text-slate-900">Edit Slot Status</p>
                  <p className="text-xs text-slate-500">Current: {selectedSpot.status}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => updateSpotStatusAPI('free')} className="px-3 py-1.5 text-sm font-medium bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200">Set Free</button>
                <button onClick={() => updateSpotStatusAPI('occupied')} className="px-3 py-1.5 text-sm font-medium bg-slate-800 text-white rounded-lg hover:bg-slate-700">Set Occupied</button>
                <button onClick={() => updateSpotStatusAPI('maintenance')} className="px-3 py-1.5 text-sm font-medium bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200">Maintenance</button>
                <button onClick={() => setSelectedSpot(null)} className="px-3 py-1.5 text-sm font-medium text-slate-500 hover:bg-slate-200 rounded-lg ml-2">Cancel</button>
              </div>
            </div>
          )}
        </Card>

        {/* Audit Trail -> Live Booking Log */}
        <Card className="p-6 overflow-hidden flex flex-col">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Live Booking Log</h3>
              <p className="text-xs text-slate-500">Real-time user reservations</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            {globalBookings.length === 0 ? (
              <div className="text-center text-slate-500 text-sm mt-10">No recent bookings.</div>
            ) : (
              globalBookings.map((log, idx) => (
                <div key={idx} className="flex gap-3 items-start pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                  <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                    log.status === 'Active' ? 'bg-emerald-500' : 
                    log.status === 'Admin Override' || log.status === 'System Reset' ? 'bg-amber-500' : 'bg-slate-300'
                  }`} />
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-bold text-slate-900">{log.id !== 'ALL' ? `Spot ${log.id}` : 'ALL SPOTS'} <span className="font-normal text-slate-600">• {log.plate}</span></p>
                      <span className="text-xs font-medium text-slate-500">{log.status}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      <span className="font-medium text-slate-700">{log.userName}</span> {log.status === 'Admin Override' || log.status === 'System Reset' ? 'modified status' : `booked from ${log.startTime} to ${log.endTime || 'Ongoing'}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};

// 3. Public Entrance Signage
const EntranceSignage = ({ spots }) => {
  const availableCount = spots.filter(s => s.status === 'free').length;
  const isFull = spots.length > 0 && availableCount === 0;

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 font-sans">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-6xl font-bold text-slate-100 tracking-tight mb-4 uppercase">Nexus Parking Hub</h1>
          <p className="text-xl text-slate-400">Real-Time Availability</p>
        </div>

        <div className={`p-12 rounded-[3rem] border-8 flex flex-col items-center justify-center ${
          isFull ? 'bg-rose-950/50 border-rose-900/50' : 'bg-emerald-950/30 border-emerald-900/50'
        }`}>
          <h2 className={`text-[8rem] md:text-[12rem] font-black leading-none tracking-tighter ${
            isFull ? 'text-rose-500' : 'text-emerald-400'
          }`}>
            {isFull ? 'FULL' : availableCount}
          </h2>
          {!isFull && <p className="text-3xl md:text-5xl font-bold text-emerald-500/80 mt-4 uppercase tracking-widest">Spots Open</p>}
        </div>

        <div className="mt-16 grid grid-cols-3 gap-8">
          {['A', 'B', 'C'].map(zone => {
            const zoneSpots = spots.filter(s => s.zone === zone && s.status === 'free').length;
            return (
              <div key={zone} className="bg-slate-900/50 p-6 rounded-3xl border border-slate-800 text-center">
                <h3 className="text-2xl font-bold text-slate-300 mb-2">ZONE {zone}</h3>
                <p className={`text-4xl font-black ${zoneSpots > 0 ? 'text-white' : 'text-slate-600'}`}>{zoneSpots}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---
export default function App() {
  const [role, setRole] = useState(null);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState('dashboard');
  
  // App States
  const [currentUser, setCurrentUser] = useState(null);
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '', role: 'driver', carNumber: '', employeeId: '' });
  const [authError, setAuthError] = useState('');
  const [authSuccess, setAuthSuccess] = useState('');
  
  const [spots, setSpots] = useState([]);
  const [emergencyMode, setEmergencyMode] = useState(false);
  const [evacuationCountdown, setEvacuationCountdown] = useState(null);
  const [globalBookings, setGlobalBookings] = useState([]);

  // 1. INITIAL DATA FETCH (REST)
  useEffect(() => {
    fetch(`${API_BASE}/spots`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        // Only set spots if it's actually an array
        if (Array.isArray(data)) {
          setSpots(data);
        } else {
          setSpots([]); 
        }
      })
      .catch(err => {
        console.error("Initial spot load failed:", err);
        setSpots([]); // Fallback to empty array to prevent white screen crash
      });
  }, []);   

  // 2. REAL-TIME ENGINE (WEBSOCKETS)
  useEffect(() => {
    const socket = new WebSocket(WS_BASE);

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      
      switch(message.type) {
        case 'SPOT_UPDATE':
          setSpots(prev => prev.map(s => s.id === message.spot_id ? { ...s, ...message.updates } : s));
          break;
        case 'EMERGENCY':
          setEmergencyMode(message.active);
          if (message.active) {
            setSpots(prev => prev.map(s => ({ ...s, status: 'free' })));
            setEvacuationCountdown(null);
          }
          break;
        case 'NEW_BOOKING_LOG':
          setGlobalBookings(prev => [message.log, ...prev]);
          break;
        default: break;
      }
    };

    return () => socket.close();
  }, []);

  // Emergency Countdown Logic (Trigger API for broadcast)
  useEffect(() => {
    if (evacuationCountdown === null) return;
    
    if (evacuationCountdown > 0) {
      const timer = setTimeout(() => setEvacuationCountdown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      // Countdown finished, tell backend to trigger emergency
      fetch(`${API_BASE}/admin/emergency`, { method: 'POST', body: JSON.stringify({ active: true }) }).catch(console.error);
    }
  }, [evacuationCountdown]);

  const startEvacuation = () => setEvacuationCountdown(10);
  const cancelEvacuation = () => setEvacuationCountdown(null);

  // 3. AUTHENTICATION (POST)
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccess('');

    const endpoint = isRegistering ? '/register' : '/login';
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm)
      });
      const data = await response.json();

      if (response.ok) {
        if (isRegistering) {
          setAuthSuccess('Registration successful! Please login.');
          setIsRegistering(false);
        } else {
          setCurrentUser(data.user);
          setRole(data.user.role);
          setCurrentPath('dashboard');
        }
      } else {
        setAuthError(data.detail || 'Authentication failed.');
      }
    } catch (err) {
      setAuthError('Could not connect to the backend server. Is it running?');
    }
  };

  const toggleAuthMode = () => {
    setIsRegistering(!isRegistering);
    setAuthError('');
    setAuthSuccess('');
    setAuthForm({ name: '', email: '', password: '', role: 'driver', carNumber: '', employeeId: '' });
  };

  // Auth Screen Render
  if (!role) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full animate-in fade-in zoom-in-95 duration-500">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-slate-900 rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-xl shadow-slate-900/10">
              <Car className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">Nexus Parking</h1>
            <p className="text-slate-500">
              {isRegistering ? 'Create your account to get started.' : 'Sign in to access your portal.'}
            </p>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
            {authSuccess && (
              <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl flex items-start gap-2 animate-in fade-in slide-in-from-top-2">
                <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                <span>{authSuccess}</span>
              </div>
            )}
            
            {authError && (
              <div className="mb-6 p-3 bg-rose-50 border border-rose-200 text-rose-600 text-sm rounded-xl flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}
            
            <form className="space-y-4" onSubmit={handleAuthSubmit}>
              {isRegistering && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Account Type</label>
                    <select 
                      value={authForm.role}
                      onChange={(e) => setAuthForm({...authForm, role: e.target.value})}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    >
                      <option value="driver">Driver</option>
                      <option value="admin_staff">Staff</option>
                      <option value="admin_super">Super Admin</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">Full Name</label>
                    <input 
                      type="text" 
                      required 
                      value={authForm.name}
                      onChange={(e) => setAuthForm({...authForm, name: e.target.value})}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                      placeholder="John Doe" 
                    />
                  </div>
                  
                  {authForm.role === 'driver' ? (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Car Number (License Plate)</label>
                      <input 
                        type="text" 
                        required 
                        value={authForm.carNumber}
                        onChange={(e) => setAuthForm({...authForm, carNumber: e.target.value})}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all uppercase" 
                        placeholder="e.g. ABC-1234" 
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1.5">Employee ID</label>
                      <input 
                        type="text" 
                        required 
                        value={authForm.employeeId}
                        onChange={(e) => setAuthForm({...authForm, employeeId: e.target.value})}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all uppercase" 
                        placeholder="e.g. EMP-999" 
                      />
                    </div>
                  )}
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                <input 
                  type="email" 
                  required 
                  value={authForm.email}
                  onChange={(e) => setAuthForm({...authForm, email: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                  placeholder="you@example.com" 
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
                <input 
                  type="password" 
                  required 
                  value={authForm.password}
                  onChange={(e) => setAuthForm({...authForm, password: e.target.value})}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all" 
                  placeholder="••••••••" 
                />
              </div>
              
              <button type="submit" className="w-full py-3 bg-slate-900 text-white rounded-xl text-sm font-medium hover:bg-slate-800 transition-colors mt-6 shadow-md shadow-slate-900/10">
                {isRegistering ? 'Register Account' : 'Sign In'}
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-slate-100 text-center">
              <button 
                type="button"
                onClick={toggleAuthMode} 
                className="text-sm text-indigo-600 font-medium hover:text-indigo-700 transition-colors block w-full"
              >
                {isRegistering ? 'Already have an account? Sign In' : "Don't have an account? Register"}
              </button>
            </div>
          </div>

          <button onClick={() => setRole('signage')} className="w-full mt-6 bg-transparent border-2 border-slate-200 border-dashed hover:border-slate-300 text-slate-600 p-4 rounded-xl transition-all flex items-center justify-center gap-3">
            <Monitor className="w-5 h-5" />
            <span className="font-medium text-sm">Launch Entrance Signage View</span>
          </button>
        </div>
      </div>
    );
  }

  // Handle Entrance Signage View
  if (role === 'signage') {
    return (
      <div className="relative">
        <button onClick={() => setRole(null)} className="absolute top-4 right-4 z-50 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg backdrop-blur-sm text-sm font-medium transition-colors">Exit Signage</button>
        <EntranceSignage spots={spots} />
      </div>
    );
  }

  const isAdmin = role.startsWith('admin');

  // Sidebar Navigation Items
  const navItems = isAdmin 
    ? [
        { id: 'dashboard', label: 'Command Center', icon: MapIcon },
        { id: 'analytics', label: 'Analytics & Heatmap', icon: BarChart3 },
        { id: 'logs', label: 'Audit Logs', icon: Clock },
        { id: 'settings', label: 'System Settings', icon: Settings },
      ]
    : [
        { id: 'dashboard', label: 'My Dashboard', icon: Car },
        { id: 'wallet', label: 'Digital Wallet', icon: Wallet },
        { id: 'history', label: 'Booking History', icon: CheckCircle2 },
        { id: 'settings', label: 'Account Settings', icon: UserCircle },
      ];

  return (
    <div className={`min-h-screen font-sans flex overflow-hidden transition-colors duration-500 ${emergencyMode ? 'bg-rose-950' : 'bg-[#F8FAFC]'}`}>
      
      {/* SIDEBAR */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-100 flex flex-col transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
        lg:relative lg:translate-x-0
      `}>
        <div className="h-16 flex items-center px-6 border-b border-slate-50 justify-between lg:justify-start">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
              <MapIcon className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-slate-900 tracking-tight text-lg">Nexus P-Sys</span>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-slate-600" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => { setCurrentPath(item.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                currentPath === item.id 
                  ? 'bg-slate-900 text-white shadow-md shadow-slate-900/10' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <item.icon className={`w-5 h-5 ${currentPath === item.id ? 'text-white/80' : 'text-slate-400'}`} />
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={() => { setRole(null); setCurrentUser(null); }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* MOBILE OVERLAY */}
      {isSidebarOpen && <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* HEADER */}
        <header className={`h-16 flex items-center justify-between px-4 lg:px-8 z-10 sticky top-0 border-b transition-colors ${
          emergencyMode ? 'bg-rose-600 border-rose-700 text-white' : 'bg-white/50 backdrop-blur-md border-slate-100'
        }`}>
          <div className="flex items-center gap-4">
            <button className="lg:hidden p-2 rounded-lg transition-colors" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="font-semibold hidden md:block">{isAdmin ? 'Command Center' : 'Driver Dashboard'}</h1>
          </div>

          <div className="flex items-center gap-4">
            {emergencyMode && (
              <span className="animate-pulse font-bold flex items-center gap-2 bg-rose-800 px-3 py-1 rounded-full text-sm">
                <AlertTriangle className="w-4 h-4"/> EVACUATION ACTIVE
              </span>
            )}
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                emergencyMode ? 'bg-white text-rose-600' : 'bg-slate-100 text-slate-600'
              }`}>
                {isAdmin ? 'A' : 'D'}
              </div>
            </div>
          </div>
        </header>

        {/* CONTENT AREA */}
        <div className="flex-1 overflow-auto p-4 lg:p-8">
          <div className="max-w-6xl mx-auto h-full">
            {currentPath === 'dashboard' ? (
              isAdmin ? (
                <AdminDashboard 
                  spots={spots} 
                  role={role} 
                  startEvacuation={startEvacuation} 
                  cancelEvacuation={cancelEvacuation}
                  evacuationCountdown={evacuationCountdown}
                  globalBookings={globalBookings}
                />
              ) : (
                <DriverDashboard 
                  spots={spots} 
                  emergencyMode={emergencyMode} 
                  currentUser={currentUser} 
                  setCurrentUser={setCurrentUser} 
                />
              )
            ) : currentPath === 'settings' && !isAdmin ? (
              <DriverSettings currentUser={currentUser} setCurrentUser={setCurrentUser} />
            ) : currentPath === 'history' && !isAdmin ? (
              <BookingHistory currentUser={currentUser} />
            ) : (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-2xl flex items-center justify-center mb-4">
                  <Settings className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2 capitalize">{currentPath.replace('-', ' ')}</h2>
                <p className="text-slate-500 max-w-sm">This module is under construction in this prototype.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}