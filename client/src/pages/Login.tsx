import { useState, ChangeEvent, FormEvent } from 'react';
import API from '../utils/api';
import { useNavigate } from 'react-router-dom';
import axios from 'axios'; // Import axios just for the error type

const Login = () => {
    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });
    const navigate = useNavigate();

    // Type the event as an Input Change Event
    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    // Type the event as a Form Submission Event
    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        try {
            const res = await API.post('/login', formData);

            localStorage.setItem('accessToken', res.data.accessToken);
            localStorage.setItem('refreshToken', res.data.refreshToken);

            navigate('/dashboard');

        } catch (err) {
            if (axios.isAxiosError(err) && err.response) {
                alert(err.response.data.msg || 'Login Failed');
            } else {
                console.error(err);
                alert('An unexpected error occurred');
            }
        }
    };

    return (
        <div className="login-container">
            <form onSubmit={handleSubmit}>
                <h2>Sign In to BrandPulse</h2>
                <div>
                    <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="Email"
                        required
                    />
                </div>
                <div>
                    <input
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Password"
                        required
                    />
                </div>
                <button type="submit">Login</button>
            </form>
        </div>
    );
};

export default Login;