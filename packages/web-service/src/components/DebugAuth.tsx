import { auth } from '../firebase';

export function DebugAuth() {
  const redirectUri = `${window.location.origin}/__/auth/handler`;

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded-lg shadow-lg max-w-md text-xs">
      <h3 className="font-bold mb-2">Auth Debug Info</h3>
      <div className="space-y-1">
        <div>
          <span className="text-gray-400">Auth Domain:</span>
          <div className="font-mono bg-gray-800 p-1 rounded mt-1 break-all">
            {auth.config.authDomain}
          </div>
        </div>
        <div>
          <span className="text-gray-400">Expected Redirect URI:</span>
          <div className="font-mono bg-gray-800 p-1 rounded mt-1 break-all">
            {redirectUri}
          </div>
        </div>
        <div className="text-yellow-400 mt-2">
          ⚠️ Add this exact URI to Discord OAuth2 redirects
        </div>
      </div>
    </div>
  );
}
