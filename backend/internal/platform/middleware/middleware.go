package middleware

import (
	"net/http"
	"slices"
)

type MiddlewareHandler func(http.Handler) http.Handler
type Middleware struct {
	next MiddlewareHandler
}

func NewMiddleware(next MiddlewareHandler) Middleware {
	return Middleware{next: next}
}

// Populates the middleware chain in order of middleware provided
// The first middleware provided will be the first to execute
func MiddlewareChain(middleware ...Middleware) MiddlewareHandler {
	return func(next http.Handler) http.Handler {
		// Defensive check: if next is nil, return a no-op handler instead of panicking
		if next == nil {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			})
		}
		for _, m := range slices.Backward(middleware) {
			next = m.next(next)
		}
		return next
	}
}
