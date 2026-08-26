import { useState } from "react";

export const useResetPassword = () => {
    const [error, setError] = useState(null)
    const [isLoading, setIsLoading] = useState(null)
    const [success, setSuccess] = useState(false)

    const resetPassword = async (email, code, newPassword) => {
        setIsLoading(true)
        setError(null)
        setSuccess(false)

        const response = await fetch('/api/user/reset-password', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ email, code, newPassword })
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

    return { resetPassword, isLoading, error, success }
}
