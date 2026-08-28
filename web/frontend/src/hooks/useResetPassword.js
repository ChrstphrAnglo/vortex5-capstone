import { useState } from "react";

export const useResetPassword = () => {
    const [error, setError] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    const resetPassword = async (email, code, newPassword) => {
        setIsLoading(true)
        setError(null)
        setSuccess(false)

        try {
            const response = await fetch('/api/user/reset-password', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email, code, newPassword })
            })
            const json = await response.json()

            if (!response.ok) {
                setError(json.error)
                return
            }

            setSuccess(true)
        } catch {
            setError('Could not reach the server. Check your connection and try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return { resetPassword, isLoading, error, success }
}
