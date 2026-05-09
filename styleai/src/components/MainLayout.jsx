import HeaderNav from './HeaderNav';
import Sidebar from './Sidebar';
import './MainLayout.css';

const MainLayout = ({ children }) => {
  return (
    <div className="main-layout-root">
      <Sidebar />
      <div className="main-layout-body">
        <HeaderNav />
        <main className="main-layout-content">
          <div className="content-inner">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
