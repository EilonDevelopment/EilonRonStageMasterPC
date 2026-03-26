import React, { createContext, useReducer } from "react";
import { PayloadAction } from "@reduxjs/toolkit";
import AxiosInstance from "../services/apiClient"
import { LoginDataType } from "../helper/types";

interface AuthStateProps {
    isAuthenticated?: boolean;
    isInitialised?: boolean;
    // eslint-disable-next-line
    user?: any;
}

interface AuthContextProps extends AuthStateProps {
    method?: string;
    // eslint-disable-next-line
    login: (loginData: LoginDataType) => Promise<any>;
    logout: () => void;
}

const initialState = {
    isAuthenticated: false,
    isInitalised: false,
    user: null
}

const setSession = (accessToken: string) => {
    if (accessToken) {
        localStorage.setItem('accessToken', accessToken)
        AxiosInstance.defaults.headers.common.Authorization = `Bearer ${accessToken}`
    } else {
        localStorage.removeItem('accessToken')
        delete AxiosInstance.defaults.headers.common.Authorization
    }
}

const reducer = (state: AuthStateProps, action: PayloadAction<AuthStateProps>) => {
    switch (action.type) {
        case 'INIT': {
            const { isAuthenticated, user } = action.payload

            return {
                ...state,
                isAuthenticated,
                isInitialised: true,
                user,
            }
        }
        case 'LOGIN': {
            const { user } = action.payload

            return {
                ...state,
                isAuthenticated: true,
                user,
            }
        }
        case 'LOGOUT': {
            return {
                ...state,
                isAuthenticated: false,
                user: null,
            }
        }
        case 'REGISTER': {
            const { user } = action.payload

            return {
                ...state,
                isAuthenticated: true,
                user,
            }
        }
        default: {
            return { ...state }
        }
    }
}

const AuthContext = createContext<AuthContextProps>({
    ...initialState,
    method: 'JWT',
    login: () => Promise.resolve(),
    // eslint-disable-next-line
    logout: () => {},
}) 

// eslint-disable-next-line
export const AuthProvider = (props: any) => {
    const { children } = props;
    const [state, dispatch] = useReducer(reducer, initialState)

    const login = async (loginData: LoginDataType) => {
        const { username, password } = loginData

        try {
            const response = await AxiosInstance.post('/auth/login', {
                username,
                password,
            })
    
            if (response.data.$success) {
                const { accessToken, user: { balance, serverSeed, ...rest } } = response.data
                // const { accessToken, user } = response.data
        
                setSession(accessToken)
        
                dispatch({
                    type: 'LOGIN',
                    payload: {
                        user: rest,
                    },
                })
                return { balance, seedInfo: { serverSeed } };
            } else {
                return false
            }
            // eslint-disable-next-line
        } catch (err: any) {
            if (err.statusCode === 401) {
                return false
            }
        }
    }

    const logout = () => {
        setSession('')
        dispatch({ type: 'LOGOUT', payload: {} })
    }

    return (
        <AuthContext.Provider
            value={{
                ...state,
                method: 'JWT',
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    )
}

export default AuthContext
