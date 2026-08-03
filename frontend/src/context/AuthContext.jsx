import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

// Parse stored JSON defensively — corrupt/legacy data must never crash the app.
const safeParseStoredUser = () => {
  try {
    const stored = localStorage.getItem('zda_user');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || !parsed.role) {
      console.warn('[AUTH] Ignoring malformed stored user');
      localStorage.removeItem('zda_user');
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('[AUTH] Failed to parse stored user, clearing it:', err.message);
    localStorage.removeItem('zda_user');
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(safeParseStoredUser);

  const [token, setToken] = useState(() => {
    return localStorage.getItem('zda_token') || null;
  });

  const [loading, setLoading] = useState(true);

  const justLoggedIn = useRef(false);


  // Logout
  const logout = useCallback(() => {
    console.log('[AUTH] logout called');

    setToken(null);
    setUser(null);

    localStorage.removeItem('zda_token');
    localStorage.removeItem('zda_user');
  }, []);



  // Verify token when app starts
  useEffect(() => {
    let cancelled = false;

    const verify = async () => {

      if (!token) {
        console.log('[AUTH] No token found');

        justLoggedIn.current = false;
        setLoading(false);
        return;
      }


      if (justLoggedIn.current) {
        console.log('[AUTH] Token created by login, skip blocking UI');
        setLoading(false);
      }


      try {

        console.log('[AUTH] Verifying token...');


        const res = await authAPI.getMe({
          headers: {
            'X-Skip-Auth-Redirect': 'true'
          }
        });


        if (cancelled) return;


        console.log(
          '[AUTH] Token valid:',
          res.data.user?.email,
          res.data.user?.role
        );


        setUser(res.data.user);


        localStorage.setItem(
          'zda_user',
          JSON.stringify(res.data.user)
        );


      } catch(error) {


        if (cancelled) return;


        if (justLoggedIn.current) {


          console.warn(
            '[AUTH] getMe failed after login:',
            error.response?.data || error.message
          );


        } else {


          console.error(
            '[AUTH] Token invalid:',
            error.response?.data || error.message
          );


          logout();

        }


      } finally {


        if (!cancelled) {

          justLoggedIn.current = false;
          setLoading(false);

        }

      }

    };


    verify();


    return () => {
      cancelled = true;
    };


  }, [token, logout]);




  // LOGIN FUNCTION
  const login = useCallback(async (email, password) => {


    console.log('[AUTH] login() called');
    console.log('[AUTH] Email:', email);



    try {


      console.log('[AUTH] Sending login request...');


      const res = await authAPI.login({
        email,
        password
      });



      console.log('[AUTH] Login response received');
      console.log('[AUTH] Response data:', res.data);



      const { token: t, user: u } = res.data;



      if (!t || !u || !u._id || !u.role) {

        console.error('[AUTH] Missing or malformed login response:', res.data);

        throw new Error('Invalid login response');

      }



      console.log(
        '[AUTH] User role:',
        u.role
      );



      justLoggedIn.current = true;



      setToken(t);

      setUser(u);



      localStorage.setItem(
        'zda_token',
        t
      );


      localStorage.setItem(
        'zda_user',
        JSON.stringify(u)
      );



      console.log('[AUTH] Login completed successfully');



      return u;



    } catch(error) {


      console.error('[AUTH] Login failed');


      if(error.response){

        console.error(
          '[AUTH] Server error:',
          error.response.data
        );

      }else{

        console.error(
          '[AUTH] Error:',
          error.message
        );

      }



      throw error;


    }


  }, []);






  // Register
  const register = useCallback(async (formData) => {


    const res = await authAPI.register(formData);


    return res.data;


  }, []);






  // Update user
  const updateUser = useCallback((updatedUser) => {


    setUser(updatedUser);


    localStorage.setItem(
      'zda_user',
      JSON.stringify(updatedUser)
    );


  }, []);






  const isRole = (...roles) => {

    return roles.includes(user?.role);

  };






  return (

    <AuthContext.Provider

      value={{

        user,

        token,

        loading,

        login,

        register,

        logout,

        updateUser,

        isRole,

        isAuthenticated: !!user

      }}

    >

      {children}

    </AuthContext.Provider>

  );


};





export const useAuth = () => {


  const ctx = useContext(AuthContext);


  if (!ctx) {


    throw new Error(
      'useAuth must be used inside AuthProvider'
    );


  }


  return ctx;


};