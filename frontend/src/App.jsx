import React, { useState, useEffect } from 'react';
// Assuming you have imported your Tailwind CSS in src/index.css

const API_BASE_URL = 'https://zerodha-poc.onrender.com';

// Helper component for the Login Screen
const LoginScreen = ({ apiBaseUrl }) => (
    <div id="login-screen" className="text-center p-8 bg-white rounded-lg shadow-lg">
        <h1 className="text-3xl font-bold text-blue-600 mb-4">Kite Connect App</h1>
        <p className="text-gray-600 mb-8">Please log in with Zerodha to access your dashboard.</p>
        <a id="login-button" 
           href={`${apiBaseUrl}/login`} 
           className="inline-block px-8 py-3 font-bold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 transition-colors">
            Login with Zerodha
        </a>
        <p className="text-sm text-gray-500 mt-4">
            You will be redirected to the official Zerodha login page.
        </p>
    </div>
);

// Helper component for the Dashboard Header/Profile Info
const ProfileInfo = ({ profile, funds }) => {
    if (!profile) {
        return (
            <div id="profile-info" className="text-right mt-4 md:mt-0">
                <div className="font-semibold text-gray-800 animate-pulse bg-gray-200 rounded w-24">&nbsp;</div>
                <div className="text-sm text-green-600 animate-pulse bg-gray-200 rounded w-32 mt-1">&nbsp;</div>
            </div>
        );
    }
    return (
        <div id="profile-info" className="text-right mt-4 md:mt-0">
            <div className="font-semibold text-gray-800">{profile.user_id}</div>
            <div className="text-sm text-green-600">
                Available Funds: ₹{funds.toLocaleString('en-IN')}
            </div>
        </div>
    );
};

// Helper component for a single holding item
const HoldingItem = ({ stock }) => {
    // Calculate PNL
    const pnl = (stock.last_price - stock.average_price) * stock.quantity;
    const isProfit = pnl >= 0;

    return (
        <div className="p-4 border rounded-md shadow-sm">
            <div className="flex justify-between items-center">
                <span className="font-bold text-lg">{stock.tradingsymbol}</span>
                <span className={`${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                    {isProfit ? '▲' : '▼'} ₹{pnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
            </div>
            <div className="text-sm text-gray-600">
                Qty: {stock.quantity} &bull; Avg: ₹{stock.average_price.toLocaleString('en-IN')}
            </div>
            <div className="text-sm text-gray-800">
                LTP: ₹{stock.last_price.toLocaleString('en-IN')}
            </div>
        </div>
    );
};


// Main App Component
function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [profile, setProfile] = useState(null);
    const [holdings, setHoldings] = useState(null); // Use null initially to distinguish from an empty array
    const [orderMessage, setOrderMessage] = useState('');
    const [totalPnl, setTotalPnl] = useState(0);

    // Calculated fields from state
    const funds = profile?.margins?.equity?.available?.cash || 0;

    // --- Data Fetching Functions (Similar to the original JS functions) ---

    const fetchProfile = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/profile`, { credentials: 'include' });
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            setProfile(data);
        } catch (error) {
            console.error("Error fetching profile:", error);
            // Optionally handle UI error state
        }
    };

    const fetchHoldings = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/holdings`, { credentials: 'include' });
            const data = await response.json();
            if (data.error) throw new Error(data.error);

            // Calculate Total P&L
            let calculatedPnl = 0;
            data.forEach(stock => {
                calculatedPnl += (stock.last_price - stock.average_price) * stock.quantity;
            });
            setTotalPnl(calculatedPnl);
            setHoldings(data);
        } catch (error) {
            console.error("Error fetching holdings:", error);
            setHoldings([]); // Set to empty array on error
        }
    };

    // --- Authentication Check (Replaces DOMContentLoaded listener) ---

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/check_auth`, { credentials: 'include' });
                if (response.ok) {
                    setIsAuthenticated(true);
                } else {
                    setIsAuthenticated(false);
                }
            } catch (error) {
                console.error("Error checking auth:", error);
                setIsAuthenticated(false);
                alert("Could not connect to the backend. Is it running on http://localhost:5000?");
            }
        };

        checkAuth();
    }, []); // Empty dependency array means this runs only once on mount

    // --- Dashboard Data Fetching (Runs when authenticated state changes) ---

    useEffect(() => {
        if (isAuthenticated) {
            fetchProfile();
            fetchHoldings();
        }
    }, [isAuthenticated]);

    // --- Order Placement Handler ---

    const handleOrderSubmit = async (event) => {
        event.preventDefault();
        
        // Use `event.nativeEvent.submitter` to find which button was clicked
        const transactionType = event.nativeEvent.submitter.dataset.action;
        
        const form = event.target;
        const symbol = form.symbol.value.toUpperCase();
        const quantity = parseInt(form.quantity.value, 10);
        
        const order = {
            tradingsymbol: symbol,
            quantity: quantity,
            transaction_type: transactionType,
            order_type: "MARKET",
            product: "CNC",
            exchange: "NSE"
        };

        setOrderMessage(`Placing ${transactionType} order...`);
        let messageClass = 'text-sm text-gray-600';

        try {
            const response = await fetch(`${API_BASE_URL}/api/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(order),
                credentials: 'include'
            });
            const data = await response.json();

            if (data.error) throw new Error(data.error);
            
            setOrderMessage(`Order ${data.order_id} placed successfully!`);
            messageClass = 'text-sm text-green-700 font-medium';
            
            // Re-fetch data
            fetchHoldings();
            fetchProfile();
        } catch (error) {
            console.error("Error placing order:", error);
            setOrderMessage(`Error: ${error.message}`);
            messageClass = 'text-sm text-red-700 font-medium';
        }
        
        // We can't set the class directly in React, we'll use a state for the class too for production code, 
        // but for this example, a simple text update suffices.
    };

    // --- Conditional Rendering ---

    if (!isAuthenticated) {
        return (
            <div id="app" className="container mx-auto p-4 md:p-8 max-w-4xl">
                <LoginScreen apiBaseUrl={API_BASE_URL} />
            </div>
        );
    }
    
    // Render Dashboard
    return (
        <div id="app" className="container mx-auto p-4 md:p-8 max-w-4xl">
            <div id="dashboard-screen" className="space-y-6">
                
                {/* Header Card */}
                <div className="p-6 bg-white rounded-lg shadow-lg">
                    <div className="flex flex-col md:flex-row justify-between md:items-center">
                        <h1 className="text-3xl font-bold text-blue-600">My Dashboard</h1>
                        <ProfileInfo profile={profile} funds={funds} />
                    </div>
                </div>

                {/* Holdings and Order Form Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                    {/* Holdings Card */}
                    <div className="md:col-span-2 p-6 bg-white rounded-lg shadow-lg">
                        <h2 className="text-xl font-semibold mb-4 border-b pb-2">My Holdings</h2>
                        <div id="holdings-list" className="space-y-4 max-h-96 overflow-y-auto">
                            
                            {/* Conditional Rendering for Holdings List */}
                            {holdings === null && (
                                <p id="holdings-loader" className="text-gray-500">Loading holdings...</p>
                            )}
                            {holdings && holdings.length === 0 && (
                                <p className="text-gray-500">No holdings found.</p>
                            )}
                            {holdings && holdings.map((stock, index) => (
                                <HoldingItem key={index} stock={stock} />
                            ))}
                            
                        </div>
                        <div className="pt-4 border-t mt-4">
                            <div className="flex justify-between font-bold text-lg">
                                <span>Total P&L</span>
                                <span 
                                    id="total-pnl" 
                                    className={`font-bold ${totalPnl >= 0 ? 'text-green-600' : 'text-red-600'}`}
                                >
                                    ₹{totalPnl.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Order Form Card */}
                    <div className="p-6 bg-white rounded-lg shadow-lg">
                        <h2 className="text-xl font-semibold mb-4 border-b pb-2">Place Order</h2>
                        <form id="order-form" className="space-y-4" onSubmit={handleOrderSubmit}>
                            <div>
                                <label htmlFor="symbol" className="block text-sm font-medium text-gray-700">Symbol</label>
                                <input type="text" id="symbol" name="symbol" defaultValue="RELIANCE" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" required />
                            </div>
                            <div>
                                <label htmlFor="quantity" className="block text-sm font-medium text-gray-700">Quantity</label>
                                <input type="number" id="quantity" name="quantity" defaultValue="1" min="1" className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500" required />
                            </div>
                            <div className="flex space-x-4">
                                <button type="submit" data-action="BUY" className="order-button flex-1 px-4 py-2 font-bold text-white bg-green-600 rounded-md hover:bg-green-700">
                                    Buy
                                </button>
                                <button type="submit" data-action="SELL" className="order-button flex-1 px-4 py-2 font-bold text-white bg-red-600 rounded-md hover:bg-red-700">
                                    Sell
                                </button>
                            </div>
                            <div id="order-message" className="text-sm mt-4">{orderMessage}</div>
                        </form>
                    </div>

                </div>
            </div>
        </div>
    );
}

export default App;