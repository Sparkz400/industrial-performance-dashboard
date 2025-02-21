import React from 'react';
import './dashboardPlusButton.css';

const DashboardPlusButton = ({ onClick }) => {
    return (
        <button className="Btn" onClick={onClick}>
            <div className="sign">+</div>
            <div className="text">Create</div>
        </button>
    );
};

export default DashboardPlusButton;
