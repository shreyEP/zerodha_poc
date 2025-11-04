import os
from flask import Flask, redirect, request, jsonify, session
from flask_cors import CORS
from kiteconnect import KiteConnect
from dotenv import load_dotenv

# Load environment variables from a .env file
load_dotenv()

app = Flask(__name__)
# This is crucial! It allows your React app (on a different port)
# to make requests to this backend.
# In production, restrict this to your frontend's domain.
CORS(app, supports_credentials=True)

# Session secret key. In production, use a long, random string.
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'a_very_bad_default_secret_key')

# --- Zerodha API Credentials (NEVER hardcode these) ---
API_KEY = os.environ.get('KITE_API_KEY')
API_SECRET = os.environ.get('KITE_API_SECRET')

if not API_KEY or not API_SECRET:
    print("Error: KITE_API_KEY or KITE_API_SECRET environment variables not set.")
    # In a real app, you'd exit or handle this gracefully
    
# Initialize the KiteConnect client
kite = KiteConnect(api_key=API_KEY)

# --- 1. Authentication Flow ---

@app.route('/login')
def login():
    """
    Redirects the user to the Zerodha login page.
    This is the first step of the authentication flow.
    """
    login_url = kite.login_url()
    # Redirect the user to Zerodha
    return redirect(login_url)

@app.route('/callback')
def callback():
    """
    Zerodha redirects back to this endpoint after a successful login.
    It contains the 'request_token' which we exchange for an 'access_token'.
    """
    request_token = request.args.get('request_token')
    if not request_token:
        return jsonify({'error': 'No request token found'}), 400

    try:
        # Exchange request_token for an access_token and user data
        data = kite.generate_session(request_token, api_secret=API_SECRET)
        
        # Store the access_token in the user's session
        # This is a server-side cookie, secure from browser JS
        session['access_token'] = data['access_token']
        
        # You can also store other user data if needed
        session['user_id'] = data['user_id']
        
        # Redirect the user back to your React frontend
        # In development, this is typically http://localhost:3000
        # You can make this URL an environment variable too
        return redirect(os.environ.get('FRONTEND_URL', 'http://localhost:5713/'))

    except Exception as e:
        return jsonify({'error': f'Authentication failed: {str(e)}'}), 400

@app.route('/api/check_auth')
def check_auth():
    """
    An endpoint for the frontend to check if a user is already logged in.
    """
    if 'access_token' in session:
        return jsonify({'authenticated': True, 'user_id': session.get('user_id')})
    else:
        return jsonify({'authenticated': False}), 401

# --- 2. API Endpoints (Proxied to Zerodha) ---

@app.before_request
def before_api_request():
    """
    A function that runs before every API request (routes starting with /api/).
    It checks for the access_token and sets it on the kite object.
    """
    if request.path.startswith('/api/'):
        if 'access_token' not in session:
            # If no token, return an authorization error
            return jsonify({'error': 'Not authenticated'}), 401
        
        # Set the access token for the kite object for this request
        try:
            kite.set_access_token(session['access_token'])
        except Exception as e:
            # This can fail if the token is expired
            session.clear() # Clear the invalid session
            return jsonify({'error': f'Session expired or invalid: {str(e)}'}), 401

@app.route('/api/profile')
def get_profile():
    """
    Fetches the user's profile and margins.
    The `before_api_request` function already set the access token.
    """
    try:
        profile = kite.profile()
        margins = kite.margins()
        # Combine profile and margins
        profile_with_margins = {**profile, "margins": margins}
        return jsonify(profile_with_margins)
    except Exception as e:
        return jsonify({'error': f'Failed to fetch profile: {str(e)}'}), 500

@app.route('/api/holdings')
def get_holdings():
    """
    Fetches the user's stock holdings.
    """
    try:
        holdings = kite.holdings()
        return jsonify(holdings)
    except Exception as e:
        return jsonify({'error': f'Failed to fetch holdings: {str(e)}'}), 500

@app.route('/api/orders', methods=['POST'])
def place_order():
    """
    Places a new order. Expects JSON data from the frontend.
    """
    order_data = request.json
    
    # Map frontend data to kiteconnect parameters
    # This is a basic example; you'd add more validation
    try:
        order_response = kite.place_order(
            variety=kite.VARIETY_REGULAR,
            exchange=order_data.get('exchange'),
            tradingsymbol=order_data.get('tradingsymbol'),
            transaction_type=order_data.get('transaction_type'),
            quantity=int(order_data.get('quantity')),
            product=order_data.get('product'),
            order_type=order_data.get('order_type')
            # Add other params as needed (price, trigger_price, etc.)
        )
        return jsonify({'status': 'success', 'order_id': order_response['order_id']})
    except Exception as e:
        return jsonify({'error': f'Order placement failed: {str(e)}'}), 400

# --- Main execution ---
if __name__ == '__main__':
    import os
    port = int(os.environ.get("PORT", 5000))  # Render provides PORT env var
    app.run(host="0.0.0.0", port=port, debug=True)

