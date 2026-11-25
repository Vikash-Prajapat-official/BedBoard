// Shown by the service worker when a page is opened with no connection. Static and bilingual on
// purpose: it is stored on the phone at install time, so it cannot depend on the chosen language.
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6 text-center">
      <h1 className="text-2xl font-bold text-blue-700">BedBoard</h1>
      <section lang="en" className="space-y-2">
        <h2 className="text-lg font-semibold">You are offline</h2>
        <p className="text-slate-700">
          This page cannot load without a connection. Anything you already tapped is saved on this phone and
          will be sent when you are back online.
        </p>
      </section>
      <section lang="hi" className="space-y-2">
        <h2 className="text-lg font-semibold">आप ऑफ़लाइन हैं</h2>
        <p className="text-slate-700">
          कनेक्शन के बिना यह पृष्ठ नहीं खुल सकता। आपने जो भी टैप किया है वह इस फ़ोन में सहेजा गया है और
          ऑनलाइन होते ही भेज दिया जाएगा।
        </p>
      </section>
      <a href="/dashboard" className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-700 px-4 font-medium text-white">
        Try again · फिर कोशिश करें
      </a>
    </main>
  );
}
