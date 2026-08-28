import { useState } from "react";
import { useAuthContext } from "./useAuthContext"

export const useSignup = () => {
    const [error, setError] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [success, setSuccess] = useState(false)
    const [message, setMessage] = useState(null)
    const {dispatch}= useAuthContext()

    const signup = async (email, password, firstName, lastName, code, teacherId, department, staffType) => {
        setIsLoading(true)
        setError(null)
        setSuccess(false)

        try {
            // Backend assigns role automatically: first account → admin, everyone else → staff.
            const response = await fetch('/api/user/signup', {
                method:'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, password, firstName, lastName, code, teacherId, department, staffType })
            })
            const json = await response.json()

            if (!response.ok){
                setError(json.error)
                return
            }

            // Only the very first account (auto-promoted to admin) comes back with a
            // token and can log straight in. Everyone else is created `pending` —
            // no token is issued until an admin approves them, so there's nothing
            // to log in with yet; just report success and let the page redirect
            // to /login with the backend's "wait for approval" message.
            if (json.token) {
                localStorage.setItem('user', JSON.stringify(json))
                dispatch({type: 'LOGIN', payload: json})
            }

            setMessage(json.message || null)
            setSuccess(true)
        } catch {
            setError('Could not reach the server. Check your connection and try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return { signup, isLoading, error, success, message }
}
