import { createContext, useReducer,useEffect } from "react";

export const AuthContext = createContext()

export const authReducer = (state, action) => {
    switch (action.type) {
        case 'LOGIN':
            return { user: action.payload }
        case 'LOGOUT':
            return { user: null }
        default:
            return state
    } 
}

// Decodes a JWT's payload without verifying the signature (verification is
// the backend's job) — just enough to read `exp` and know locally whether a
// stored token is already stale, instead of trusting it forever.
const isTokenExpired = (token) => {
    try {
        const payload = JSON.parse(atob(token.split('.')[1]))
        if (!payload.exp) return false
        return Date.now() >= payload.exp * 1000
    } catch {
        return true
    }
}

export const AuthContextProvider = ({ children }) => {
    const [state, dispatch] = useReducer(authReducer, {
        user: null
    })

    useEffect(()=> {
        let user = null
        try {
            user = JSON.parse(localStorage.getItem('user'))
        } catch {
            // Corrupted value — drop it instead of crashing on mount.
            localStorage.removeItem('user')
        }

        if (user && user.token && !isTokenExpired(user.token)) {
            dispatch({type: 'LOGIN', payload:user})
        } else if (user) {
            // Present but expired/malformed — don't leave the app "looking"
            // logged in while every real API call would 401.
            localStorage.removeItem('user')
        }
    },[])

    return(
        <AuthContext.Provider value ={{...state, dispatch}}>
            {children}
        </AuthContext.Provider>
    )
}
