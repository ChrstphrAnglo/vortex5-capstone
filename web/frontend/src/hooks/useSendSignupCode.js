import { useState } from "react";

export const useSendSignupCode = () => {
    const [error, setError] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [success, setSuccess] = useState(false)

    const sendSignupCode = async (email) => {
        setIsLoading(true)
        setError(null)
        setSuccess(false)

        try {
            const response = await fetch('/api/user/signup/send-code', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ email })
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

    return { sendSignupCode, isLoading, error, success }
}
