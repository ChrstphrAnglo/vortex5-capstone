import { useState } from "react";

export const useForgotPassword = () => {
    const [error, setError] = useState(null)
    const [isLoading, setIsLoading] = useState(null)
    const [success, setSuccess] = useState(false)

    const forgotPassword = async (email) => {
        setIsLoading(true)
        setError(null)
        setSuccess(false)

        const response = await fetch('/api/user/forgot-password', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email })
        })
        const json = await response.json()

        if (!response.ok) {
            setIsLoading(false)
            setError(json.error)
        }
        if (response.ok) {
            setIsLoading(false)
            setSuccess(true)
        }
    }

    return { forgotPassword, isLoading, error, success }
}
