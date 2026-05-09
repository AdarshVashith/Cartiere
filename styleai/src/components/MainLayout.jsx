import HeaderNav from './HeaderNav';
import MobileNav from './MobileNav';
import Sidebar from './Sidebar';
import './MainLayout.css';

const MainLayout = ({ children }) => {
  return (
    <div className="main-layout-root">
      <div className="main-layout-body">
        <HeaderNav />
        <main className="main-layout-content">
          <div className="content-inner">
            {children}
          </div>
        </main>
      </div>
      <MobileNav />
    </div>
  );
};

export default MainLayout;
