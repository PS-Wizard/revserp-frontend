import { Link, isRouteErrorResponse, useRouteError } from "react-router"

export function HandbookRouteError({
  notFoundHeading,
  notFoundHint,
}: {
  notFoundHeading: string
  notFoundHint: string
}) {
  const routeError = useRouteError()
  const isMissing =
    isRouteErrorResponse(routeError) && routeError.status === 404
  return (
    <div className="handbook-missing">
      <h1>
        {isMissing ? notFoundHeading : "Could not load this handbook page."}
      </h1>
      <p>
        {isMissing
          ? notFoundHint
          : "Please try again. If the problem continues, return to the handbook home."}
      </p>
      <Link to="/handbook">Back to the handbook home</Link>
    </div>
  )
}
