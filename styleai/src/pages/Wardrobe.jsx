import MainLayout from '../components/MainLayout';

function Wardrobe() {
  return (
    <MainLayout>
      <div className="fade-in-up">
        <div className="flex flex-col gap-8">
          <header className="mb-4 flex justify-end">
          </header>

          <section className="premium-card p-12 text-center flex flex-col items-center justify-center min-h-[400px]">
             <div className="w-20 h-20 bg-mauve-soft rounded-full flex items-center justify-center mb-6">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--mauve)" strokeWidth="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M9 20V6"/><path d="M15 20V6"/><path d="M2 10h20"/></svg>
             </div>
             <h3 className="text-xl font-semibold mb-2">Wardrobe Sync in Progress</h3>
             <p className="text-gray-500 max-w-sm">We are refining the wardrobe experience. Your items are being processed for AI styling.</p>
          </section>
        </div>
      </div>
    </MainLayout>
  );
}

export default Wardrobe;
