/**
 * ratings_reviews.js — Star Rating & Reviews Form
 * ────────────────────────────────────────────────
 * Fetches ratings, renders review score bars, handles star buttons logic,
 * and posts verified user reviews to the server.
 */

window.RatingsReviewsService = (() => {
  'use strict';

  async function loadRatingsAndReviews(narrativeId, authorId) {
    const cleanId = String(narrativeId).replace('sqlite-', '');
    const container = document.getElementById('modalReviewsSection');
    if (!container) return;

    container.innerHTML = '<div class="py-6 text-center text-sm text-outline">Loading reviews...</div>';

    try {
      const res = await fetch(`/api/ratings/${cleanId}`);
      const data = await res.json();
      const ratings = data.ratings || [];

      // Check if user is authenticated and if they are the author
      const currentUser = window.currentUser;
      const isAuthor = currentUser && currentUser.uid === authorId;
      const alreadyReviewed = currentUser && ratings.some(r => r.userId === currentUser.uid);

      let formHtml = '';
      if (!currentUser) {
        formHtml = `
          <div class="p-4 bg-orange-50 text-orange-800 rounded-2xl text-sm font-semibold border border-orange-100">
            🔒 Please <a href="/login.html" class="underline hover:text-orange-950">sign in</a> to submit a rating and review.
          </div>
        `;
      } else if (isAuthor) {
        formHtml = `
          <div class="p-4 bg-surface-container rounded-2xl text-sm font-medium text-on-surface-variant border border-outline-variant">
            ℹ️ You cannot rate or review your own narrative.
          </div>
        `;
      } else if (alreadyReviewed) {
        const userReview = ratings.find(r => r.userId === currentUser.uid);
        formHtml = `
          <div class="p-5 bg-tertiary-fixed/30 text-on-tertiary-fixed rounded-2xl border border-tertiary-fixed/60">
            <h4 class="font-bold text-sm mb-1">Your Review</h4>
            <div class="flex items-center gap-1 mb-2">
              <span class="text-secondary-container text-lg">${'★'.repeat(userReview.rating)}${'☆'.repeat(5 - userReview.rating)}</span>
            </div>
            ${userReview.review ? `<p class="text-sm italic">"${escHtml(userReview.review)}"</p>` : ''}
          </div>
        `;
      } else {
        formHtml = `
          <form id="narrativeReviewForm" class="space-y-4 p-5 bg-white rounded-2xl border border-outline-variant shadow-sm">
            <h4 class="font-bold text-sm text-primary uppercase tracking-wider">Leave a Review</h4>
            
            <div class="space-y-2">
              <label class="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">Rating</label>
              <div class="flex gap-1" id="reviewFormStars">
                <span class="star-btn cursor-pointer text-2xl text-outline-variant hover:text-secondary-container transition-all" data-star="1">★</span>
                <span class="star-btn cursor-pointer text-2xl text-outline-variant hover:text-secondary-container transition-all" data-star="2">★</span>
                <span class="star-btn cursor-pointer text-2xl text-outline-variant hover:text-secondary-container transition-all" data-star="3">★</span>
                <span class="star-btn cursor-pointer text-2xl text-outline-variant hover:text-secondary-container transition-all" data-star="4">★</span>
                <span class="star-btn cursor-pointer text-2xl text-outline-variant hover:text-secondary-container transition-all" data-star="5">★</span>
              </div>
              <input type="hidden" name="rating" id="reviewFormRatingInput" required>
            </div>

            <div class="space-y-2">
              <label class="block text-xs font-bold text-on-surface-variant uppercase tracking-wider" for="reviewFormComment">Review Comment</label>
              <textarea id="reviewFormComment" name="review" rows="3" placeholder="Write your comments here (optional)..."
                        class="w-full px-4 py-3 rounded-xl border border-outline-variant focus:border-primary focus:ring-1 focus:ring-primary outline-none text-sm resize-none"></textarea>
            </div>

            <button type="submit" id="reviewFormSubmitBtn" disabled
                    class="px-6 py-2.5 bg-primary text-white rounded-xl font-label-md text-sm hover:bg-primary-container disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              Submit Review
            </button>
          </form>
        `;
      }

      // Render reviews list
      let reviewsListHtml = '';
      if (ratings.length === 0) {
        reviewsListHtml = '<p class="text-sm text-on-surface-variant italic p-4">No reviews yet. Be the first to leave one!</p>';
      } else {
        reviewsListHtml = `
          <div class="space-y-4">
            ${ratings.map(r => {
              const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
              const dateStr = new Date(r.createdAt || r.created_at).toLocaleDateString('en-IN', {
                day: 'numeric', month: 'short', year: 'numeric'
              });
              return `
                <div class="p-4 bg-surface rounded-xl border border-outline-variant/60 flex flex-col gap-1.5">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-sm text-on-surface">${escHtml(r.userName)}</span>
                    <span class="text-xs text-outline">${dateStr}</span>
                  </div>
                  <div class="text-secondary-container text-sm font-bold">${stars}</div>
                  ${r.review ? `<p class="text-sm text-on-surface-variant italic">"${escHtml(r.review)}"</p>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-outline-variant">
          <!-- Left Column: Review Form -->
          <div class="space-y-4">
            ${formHtml}
          </div>
          <!-- Right Column: Reviews List -->
          <div class="space-y-4">
            <h4 class="font-bold text-sm text-primary uppercase tracking-wider">Recent Reviews (${ratings.length})</h4>
            <div class="max-h-[300px] overflow-y-auto pr-2 space-y-4 no-scrollbar">
              ${reviewsListHtml}
            </div>
          </div>
        </div>
      `;

      // Set up star click listeners
      const stars = container.querySelectorAll('.star-btn');
      const input = container.querySelector('#reviewFormRatingInput');
      const submitBtn = container.querySelector('#reviewFormSubmitBtn');
      const reviewForm = container.querySelector('#narrativeReviewForm');

      stars.forEach(star => {
        const value = parseInt(star.dataset.star);
        star.addEventListener('click', () => {
          if (input) input.value = value;
          if (submitBtn) submitBtn.disabled = false;
          stars.forEach(s => {
            const v = parseInt(s.dataset.star);
            if (v <= value) {
              s.classList.add('text-secondary-container');
              s.classList.remove('text-outline-variant');
            } else {
              s.classList.remove('text-secondary-container');
              s.classList.add('text-outline-variant');
            }
          });
        });
      });

      if (reviewForm) {
        reviewForm.addEventListener('submit', (e) => {
          submitNarrativeReview(e, cleanId, authorId);
        });
      }

    } catch (e) {
      console.error(e);
      container.innerHTML = '<div class="py-6 text-center text-sm text-error">Could not load reviews at this time.</div>';
    }
  }

  async function submitNarrativeReview(event, narrativeId, authorId) {
    event.preventDefault();
    const form = event.target;
    const rating = form.querySelector('[name="rating"]').value;
    const review = form.querySelector('[name="review"]').value;
    const btn = form.querySelector('#reviewFormSubmitBtn');

    if (btn) { btn.disabled = true; btn.textContent = 'Submitting...'; }

    try {
      const fetchFn = window.authFetch || fetch;
      const res = await fetchFn(`/api/ratings/${narrativeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, review }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Submission failed');

      showToast('Thank you for your review!', 'success');
      // Reload reviews section and explore feed
      await loadRatingsAndReviews(narrativeId, authorId);
      if (typeof loadExploreGrid === 'function' && document.getElementById('view-explore').classList.contains('active')) {
        loadExploreGrid();
      }
    } catch (e) {
      showToast(e.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Submit Review'; }
    }
  }

  return {
    loadRatingsAndReviews,
    submitNarrativeReview,
  };
})();
