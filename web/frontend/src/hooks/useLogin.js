import { useState } from "react";
import { useAuthContext } from "./useAuthContext"

export const useLogin = () => {
    const [error, setError] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const {dispatch}= useAuthContext()

    const login = async(email, password) =>{
        setIsLoading(true)
        setError(null)

        try {
            const response = await fetch('/api/user/login', {
                method:'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({email,password})
            })
            const json = await response.json()

            if (!response.ok){
                setError(json.error)
                return
            }

            // save the user to local storage
            localStorage.setItem('user', JSON.stringify(json))

            //update the auth context
            dispatch({type: 'LOGIN', payload: json})
        } catch {
            setError('Could not reach the server. Check your connection and try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return{ login, isLoading, error}
}