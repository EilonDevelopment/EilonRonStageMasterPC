import axios from "axios";

const AxiosInstance = axios.create({
    baseURL: process.env.REACT_APP_API_URL,
})

AxiosInstance.interceptors.request.use(
    (config) => config,
    (err) => {
        return Promise.reject(
            (err.response && err.response.data) || 'Something went wrong'
        )
    }
)

AxiosInstance.interceptors.response.use(
    (response) => response,
    (err) => {
        return Promise.reject(
            (err.response && err.response.data) || 'Something went wrong'
        )
    }
)

export default AxiosInstance
